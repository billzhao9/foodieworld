import { ManagedSessions } from "./managed-live";
import { MediaArchive } from "./media-archive";
import { setCreationLike } from "./likes";
import { MML_NARRATION_NAMESPACE } from "./mml-narration";
import { cookwareSchema } from "../shared/cookware";
import { MAX_BASE_INGREDIENTS } from "../shared/limits";
import { Narrations, type NarrationSynthesizer } from "./narration";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import {
  createHash,
  randomUUID,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";
import { Database } from "./db";
import { ApiError, makeUpstream, type Upstream } from "./upstream";
import { Crafts } from "./crafts";
import { LiveSessions } from "./live";
import { mediaResponse } from "./media";
import { exportMp4 } from "./recording";
const uuid = z.string().uuid();
const metaSchema = z.object({
  id: uuid,
  dishId: z.string().max(100),
  cookware: cookwareSchema,
  baseIngredients: z
    .array(z.string().max(100))
    .max(MAX_BASE_INGREDIENTS)
    .optional(),
  title: z.string().max(100),
  titleEn: z.string().max(160).optional(),
  description: z.string().max(500),
  descriptionEn: z.string().max(500).optional(),
  ingredients: z.array(z.string().max(100)).max(12),
  animals: z.array(z.string().max(100)).max(12).default([]),
  createdAt: z.number(),
});
function same(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function createApp(
  config: Config,
  db: Database,
  upstream: Upstream = makeUpstream(config),
  synthesizer?: NarrationSynthesizer,
) {
  const archive = new MediaArchive(config);
  const crafts = new Crafts(db, upstream);
  const narrations = new Narrations(
    db,
    crafts,
    synthesizer,
    process.env.NARRATION_PROVIDER === "mmlone" ||
      process.env.NODE_ENV === "production"
      ? MML_NARRATION_NAMESPACE
      : "macos-v1",
  );
  const managed = new ManagedSessions(
    config,
    db,
    upstream,
    crafts,
    narrations,
    archive,
  );
  const sessions = new LiveSessions(
    db,
    upstream,
    crafts,
    config.environment,
    config.managedLive ? managed : undefined,
  );
  const app = new Hono<{ Variables: { owner: string; visitor: string } }>();
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    if (!["GET", "HEAD"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin) {
        const allowed =
          process.env.NODE_ENV === "production" ||
          (config.environment === "production" &&
            process.env.NODE_ENV !== "development")
            ? ["https://foodieworld.mmlone.com"]
            : [
                new URL(c.req.url).origin,
                "http://localhost:5174",
                "http://127.0.0.1:5174",
                ...(process.env.APP_ORIGINS || "")
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              ];
        if (!allowed.includes(origin))
          throw new ApiError("INVALID_ORIGIN", 403);
      }
    }
    await next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 85 * 1024 * 1024,
      onError: (c) => c.json({ error: { code: "FILE_TOO_LARGE" } }, 413),
    }),
  );
  app.get("/api/health", async (c) => {
    await db.pool.query("SELECT 1");
    return c.json({ ok: true });
  });
  app.post("/api/auth/login", async (c) => {
    const { password } = z
      .object({ password: z.string().max(256) })
      .parse(await c.req.json());
    const now = Date.now();
    await db.transaction(async (client) => {
      const r = await client.query("SELECT * FROM fw_logins WHERE bucket=$1", [
        "login",
      ]);
      const row = r.rows[0];
      if (row && Number(row.expires_at) > now && row.attempts >= 20)
        throw new ApiError("RATE_LIMITED", 429);
      await client.query(
        "INSERT INTO fw_logins VALUES($1,1,$2) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN fw_logins.expires_at<$3 THEN 1 ELSE fw_logins.attempts+1 END,expires_at=CASE WHEN fw_logins.expires_at<$3 THEN $2 ELSE fw_logins.expires_at END",
        ["login", now + 60000, now],
      );
    });
    if (!same(password, config.password))
      throw new ApiError("WRONG_PASSWORD", 401);
    const owner = randomUUID();
    await setSignedCookie(
      c,
      "fw_session",
      JSON.stringify({ owner, expires: now + 7 * 86400000 }),
      config.secret,
      {
        httpOnly: true,
        secure: config.secure,
        sameSite: "Strict",
        path: "/",
        maxAge: 7 * 86400,
      },
    );
    return c.json({ ok: true });
  });
  // Only these token-bound, read-only routes bypass the kitchen password.
  async function creationMedia(
    request: Request,
    lookup: "id" | "share_token",
    value: string,
    media: "image" | "video" | "cover",
  ) {
    const columns =
      media === "cover"
        ? "COALESCE(cover,image) AS data,COALESCE(cover_type,image_type) AS type,COALESCE(cover_asset_id,image_asset_id) AS asset_id"
        : `${media} AS data,${media}_type AS type,${media}_asset_id AS asset_id`;
    const result = await db.pool.query(
      `SELECT ${columns},video_publication_url FROM fw_creations WHERE ${lookup}=$1`,
      [value],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError("NOT_FOUND", 404);
    if (row.asset_id) {
      if (media === "video") {
        if (!row.video_publication_url)
          throw new ApiError("MEDIA_ARCHIVE_PENDING", 503);
        // MML ONE validates publication and trash status on every media request.
        // Never fall back to legacy bytes after ownership has moved to MML ONE.
        return new Response(null, {
          status: 307,
          headers: {
            Location: archive.publicationUrl(
              row.video_publication_url,
              request,
            ),
            "Cache-Control": "no-store",
          },
        });
      }
      return archive.read(row.asset_id, request);
    }
    if (!row.data) throw new ApiError("NOT_FOUND", 404);
    const url = new URL(request.url);
    const asMp4 = media === "video" && url.searchParams.get("format") === "mp4";
    const bytes = asMp4
      ? await exportMp4(row.data, String(row.type))
      : row.data;
    return mediaResponse(
      bytes,
      asMp4 ? "video/mp4" : String(row.type),
      request.headers.get("range") ?? undefined,
      media === "video" && url.searchParams.get("download") === "1",
    );
  }
  const shareToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  app.get("/api/shared/:token", async (c) => {
    const token = shareToken.parse(c.req.param("token"));
    const r = await db.pool.query(
      "SELECT meta, video_status, (video IS NOT NULL OR video_asset_id IS NOT NULL) AS has_video FROM fw_creations WHERE share_token=$1",
      [token],
    );
    if (!r.rows[0]) throw new ApiError("NOT_FOUND", 404);
    c.header("X-Robots-Tag", "noindex, nofollow");
    return c.json({
      ...metaSchema.parse(r.rows[0].meta),
      imageUrl: `/api/shared/${token}/cover`,
      hasVideo: r.rows[0].has_video === true,
      videoStatus: r.rows[0].video_status,
    });
  });
  app.get("/api/shared/:token/:media", async (c) => {
    const token = shareToken.parse(c.req.param("token"));
    const media = z
      .enum(["image", "video", "cover"])
      .parse(c.req.param("media"));
    return creationMedia(c.req.raw, "share_token", token, media);
  });
  app.use("/api/*", async (c, next) => {
    const cookie = await getSignedCookie(c, config.secret, "fw_session");
    if (!cookie) throw new ApiError("UNAUTHORIZED", 401);
    let session;
    try {
      session = z
        .object({ owner: uuid, expires: z.number() })
        .parse(JSON.parse(cookie));
    } catch {
      throw new ApiError("UNAUTHORIZED", 401);
    }
    if (session.expires < Date.now()) throw new ApiError("UNAUTHORIZED", 401);
    c.set("owner", session.owner);
    const existingVisitor = await getSignedCookie(
      c,
      `${config.secret}:visitor`,
      "fw_visitor",
    );
    // Concurrent first requests use the same signed session identity.
    const visitor = uuid.safeParse(existingVisitor).success
      ? String(existingVisitor)
      : session.owner;
    if (visitor !== existingVisitor)
      await setSignedCookie(
        c,
        "fw_visitor",
        visitor,
        `${config.secret}:visitor`,
        {
          httpOnly: true,
          secure: config.secure,
          sameSite: "Strict",
          path: "/",
          maxAge: 365 * 86400,
        },
      );
    c.set("visitor", visitor);
    await next();
  });
  app.get("/api/auth", (c) => c.json({ ok: true }));
  app.post("/api/auth/logout", async (c) => {
    const r = await db.pool.query(
      "SELECT id FROM fw_live WHERE owner=$1 AND managed=false",
      [c.get("owner")],
    );
    for (const row of r.rows)
      await sessions.stop(String(row.id), c.get("owner"));
    deleteCookie(c, "fw_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/crafts", async (c) => {
    const body = z
      .object({
        id: uuid,
        cookware: cookwareSchema,
        ingredients: z
          .array(z.string().trim().min(1).max(80))
          .min(1)
          .max(MAX_BASE_INGREDIENTS),
      })
      .parse(await c.req.json());
    return c.json(
      await crafts.create(
        body.id,
        c.get("owner"),
        body.ingredients,
        body.cookware,
      ),
    );
  });
  app.post("/api/crafts/:id/prepare", async (c) =>
    c.json(await crafts.prepare(uuid.parse(c.req.param("id")), c.get("owner"))),
  );
  app.get("/api/crafts/:id", async (c) =>
    c.json(await crafts.poll(uuid.parse(c.req.param("id")), c.get("owner"))),
  );
  app.post("/api/crafts/:id/narration", async (c) => {
    const body = z
      .object({ language: z.enum(["zh", "en"]), actionId: uuid.optional() })
      .strict()
      .parse(await c.req.json());
    const audio = await narrations.get(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
      body.language,
      body.actionId,
    );
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type":
          audio.toString("ascii", 0, 4) === "RIFF" ? "audio/wav" : "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  });
  app.get("/api/crafts/:id/image", async (c) => {
    const craft = await crafts.read(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
    );
    if (!craft.imageUrl) throw new ApiError("NOT_READY", 409);
    const url = new URL(craft.imageUrl);
    if (
      url.protocol !== "https:" ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)
    )
      throw new ApiError("INVALID_IMAGE_URL");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const type = response.headers.get("content-type")?.split(";")[0] || "";
    if (
      !response.ok ||
      !["image/png", "image/jpeg", "image/webp"].includes(type)
    )
      throw new ApiError("IMAGE_DOWNLOAD_FAILED");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body!.getReader();
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiError("FILE_TOO_LARGE", 413);
      }
      chunks.push(r.value);
    }
    return new Response(Buffer.concat(chunks), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
  app.get("/api/live/:id/stream/:resource", async (c) =>
    managed.stream(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
      c.req.param("resource"),
      c.req.raw,
    ),
  );
  app.get("/api/live/recover", async (c) =>
    c.json(await managed.recover(c.get("owner"))),
  );
  app.get("/api/live/:id", async (c) =>
    c.json(await managed.status(uuid.parse(c.req.param("id")), c.get("owner"))),
  );
  app.post("/api/live/:id/retry-archive", async (c) => {
    await managed.retryArchive(uuid.parse(c.req.param("id")), c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/crafts/:id/live", async (c) => {
    const raw = await c.req.text();
    const body = z
      .object({ language: z.enum(["zh", "en"]).default("zh") })
      .parse(raw ? JSON.parse(raw) : {});
    return c.json(
      await sessions.start(
        uuid.parse(c.req.param("id")),
        c.get("owner"),
        body.language,
      ),
    );
  });
  app.post("/api/live/:id/heartbeat", async (c) => {
    await sessions.heartbeat(uuid.parse(c.req.param("id")), c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/live/:id/stop", async (c) => {
    const id = uuid.parse(c.req.param("id"));
    const existing = await db.pool.query(
      "SELECT 1 FROM fw_managed_sessions WHERE id=$1 AND owner=$2",
      [id, c.get("owner")],
    );
    if (existing.rowCount) await managed.stop(id, c.get("owner"));
    else await sessions.stop(id, c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/live/:id/actions", async (c) => {
    const session = await sessions.assertActive(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
    );
    const body = z
      .object({
        id: uuid,
        ingredient: z.string().trim().min(1).max(100),
        kind: z.enum(["ingredient", "animal"]).default("ingredient"),
        language: z.enum(["zh", "en"]).default("zh"),
      })
      .parse(await c.req.json());
    const action = await crafts.action(
      session.craft_id,
      c.get("owner"),
      body.id,
      body.ingredient,
      body.kind,
    );
    if (session.managed)
      await managed.queue(
        session.id,
        c.get("owner"),
        body.id,
        action.prompt,
        body.language,
      );
    return c.json(action);
  });
  app.post("/api/live/:id/actions/:actionId/ack", async (c) => {
    const session = await sessions.assertActive(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
    );
    if (session.managed) {
      const state = await managed.status(session.id, c.get("owner"));
      if (
        !state.session.commands.some(
          (command) =>
            command.commandId === c.req.param("actionId") &&
            command.status === "ack",
        )
      )
        throw new ApiError("IN_PROGRESS", 409);
      return c.json({ ok: true });
    }
    await crafts.acknowledge(
      session.craft_id,
      c.get("owner"),
      uuid.parse(c.req.param("actionId")),
    );
    return c.json({ ok: true });
  });
  app.get("/api/creations", async (c) => {
    const r = await db.pool.query(
      `SELECT c.id,c.meta,c.video_status,(c.video IS NOT NULL OR c.video_asset_id IS NOT NULL) AS has_video,
        (SELECT count(*)::int FROM fw_creation_likes l WHERE l.creation_id=c.id) AS like_count,
        EXISTS(SELECT 1 FROM fw_creation_likes l WHERE l.creation_id=c.id AND l.visitor=$1) AS liked
       FROM fw_creations c ORDER BY c.created_at DESC LIMIT 100`,
      [c.get("visitor")],
    );
    return c.json(
      r.rows.map((r) => ({
        ...metaSchema.parse(r.meta),
        imageUrl: `/api/creations/${r.id}/cover`,
        hasVideo: r.has_video === true,
        videoStatus: r.video_status,
        likeCount: Number(r.like_count),
        liked: r.liked === true,
      })),
    );
  });
  app.put("/api/creations/:id/like", async (c) => {
    const id = uuid.parse(c.req.param("id"));
    const { liked } = z
      .object({ liked: z.boolean() })
      .strict()
      .parse(await c.req.json());
    return c.json(await setCreationLike(db, id, c.get("visitor"), liked));
  });
  app.post("/api/creations", async (c) => {
    const body = await c.req.parseBody();
    if (typeof body.meta !== "string") throw new ApiError("INVALID_INPUT", 400);
    const meta = metaSchema.parse(JSON.parse(body.meta));
    const image = body.image;
    const video = body.video;
    const cover = body.cover;
    if (
      cover &&
      (!(cover instanceof File) ||
        !["image/png", "image/jpeg", "image/webp"].includes(cover.type) ||
        cover.size > 20 * 1024 * 1024)
    )
      throw new ApiError("INVALID_IMAGE", 400);
    if (
      !(image instanceof File) ||
      !["image/png", "image/jpeg", "image/webp"].includes(image.type) ||
      image.size > 20 * 1024 * 1024
    )
      throw new ApiError("INVALID_IMAGE", 400);
    if (
      video &&
      (!(video instanceof File) ||
        !["video/webm", "video/mp4", "video/x-matroska"].includes(
          video.type.split(";")[0],
        ) ||
        video.size > 60 * 1024 * 1024)
    )
      throw new ApiError("INVALID_VIDEO", 400);
    const videoData =
      video instanceof File ? Buffer.from(await video.arrayBuffer()) : null;
    const videoStatus = videoData ? "pending" : "ready";
    await db.pool.query(
      "INSERT INTO fw_creations(id,meta,image,image_type,video,video_type,cover,cover_type,video_status,media_archive_scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING",
      [
        meta.id,
        JSON.stringify(meta),
        Buffer.from(await image.arrayBuffer()),
        image.type,
        videoData,
        video instanceof File ? video.type : null,
        cover instanceof File ? Buffer.from(await cover.arrayBuffer()) : null,
        cover instanceof File ? cover.type : null,
        videoStatus,
        config.mediaArchive ? config.environment : null,
      ],
    );
    const stored = await db.pool.query(
      "SELECT video_status FROM fw_creations WHERE id=$1",
      [meta.id],
    );
    return c.json({
      ok: true,
      id: meta.id,
      videoStatus: stored.rows[0].video_status,
    });
  });
  app.post("/api/creations/:id/share", async (c) => {
    const id = uuid.parse(c.req.param("id"));
    const r = await db.pool.query(
      "UPDATE fw_creations SET share_token=COALESCE(share_token,$2) WHERE id=$1 RETURNING share_token",
      [id, randomBytes(32).toString("base64url")],
    );
    if (!r.rows[0]) throw new ApiError("NOT_FOUND", 404);
    return c.json({ url: `/?share=${r.rows[0].share_token}` });
  });
  app.get("/api/creations/:id/:media", async (c) => {
    const id = uuid.parse(c.req.param("id"));
    const media = z
      .enum(["image", "video", "cover"])
      .parse(c.req.param("media"));
    return creationMedia(c.req.raw, "id", id, media);
  });
  app.onError((e, c) => {
    if (e instanceof ApiError)
      return c.json({ error: { code: e.code } }, e.status as 400);
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return c.json({ error: { code: "INVALID_INPUT" } }, 400);
    console.error("request_failed", e instanceof Error ? e.name : "unknown");
    return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
  });
  return {
    app,
    cleanup: () => sessions.cleanup(),
    managedCleanup: () => managed.cleanup(),
  };
}
