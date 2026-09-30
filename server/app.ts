import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";
import { Database } from "./db";
import { ApiError, makeUpstream, type Upstream } from "./upstream";
import { Crafts } from "./crafts";
import { LiveSessions } from "./live";
const uuid = z.string().uuid();
const metaSchema = z.object({
  id: uuid,
  dishId: z.string().max(100),
  baseIngredients: z.array(z.string().max(100)).max(6).optional(),
  title: z.string().max(100),
  titleEn: z.string().max(160).optional(),
  description: z.string().max(500),
  descriptionEn: z.string().max(500).optional(),
  ingredients: z.array(z.string().max(100)).max(12),
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
) {
  const crafts = new Crafts(db, upstream);
  const sessions = new LiveSessions(db, upstream, crafts, config.environment);
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    if (!["GET", "HEAD"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (
        origin &&
        new URL(origin).host !== c.req.header("host") &&
        ![
          "http://localhost:5174",
          "http://127.0.0.1:5174",
          ...(process.env.APP_ORIGINS || "").split(","),
        ].includes(origin)
      )
        throw new ApiError("INVALID_ORIGIN", 403);
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
    await next();
  });
  app.get("/api/auth", (c) => c.json({ ok: true }));
  app.post("/api/auth/logout", async (c) => {
    const r = await db.pool.query("SELECT id FROM fw_live WHERE owner=$1", [
      c.get("owner"),
    ]);
    for (const row of r.rows)
      await sessions.stop(String(row.id), c.get("owner"));
    deleteCookie(c, "fw_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/crafts", async (c) => {
    const body = z
      .object({
        id: uuid,
        ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
      })
      .parse(await c.req.json());
    return c.json(
      await crafts.create(body.id, c.get("owner"), body.ingredients),
    );
  });
  app.post("/api/crafts/:id/prepare", async (c) =>
    c.json(await crafts.prepare(uuid.parse(c.req.param("id")), c.get("owner"))),
  );
  app.get("/api/crafts/:id", async (c) =>
    c.json(await crafts.poll(uuid.parse(c.req.param("id")), c.get("owner"))),
  );
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
  app.post("/api/crafts/:id/live", async (c) =>
    c.json(await sessions.start(uuid.parse(c.req.param("id")), c.get("owner"))),
  );
  app.post("/api/live/:id/heartbeat", async (c) => {
    await sessions.heartbeat(uuid.parse(c.req.param("id")), c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/live/:id/stop", async (c) => {
    await sessions.stop(uuid.parse(c.req.param("id")), c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/live/:id/actions", async (c) => {
    const session = await sessions.assertActive(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
    );
    const body = z
      .object({ id: uuid, ingredient: z.string().trim().min(1).max(100) })
      .parse(await c.req.json());
    return c.json(
      await crafts.action(
        session.craft_id,
        c.get("owner"),
        body.id,
        body.ingredient,
      ),
    );
  });
  app.post("/api/live/:id/actions/:actionId/ack", async (c) => {
    const session = await sessions.assertActive(
      uuid.parse(c.req.param("id")),
      c.get("owner"),
    );
    await crafts.acknowledge(
      session.craft_id,
      c.get("owner"),
      uuid.parse(c.req.param("actionId")),
    );
    return c.json({ ok: true });
  });
  app.get("/api/creations", async (c) => {
    const r = await db.pool.query(
      "SELECT id,meta,video IS NOT NULL AS has_video FROM fw_creations ORDER BY created_at DESC LIMIT 100",
    );
    return c.json(
      r.rows.map((r) => ({
        ...metaSchema.parse(r.meta),
        imageUrl: `/api/creations/${r.id}/image`,
        hasVideo: r.has_video === true,
      })),
    );
  });
  app.post("/api/creations", async (c) => {
    const body = await c.req.parseBody();
    if (typeof body.meta !== "string") throw new ApiError("INVALID_INPUT", 400);
    const meta = metaSchema.parse(JSON.parse(body.meta));
    const image = body.image;
    const video = body.video;
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
    await db.pool.query(
      "INSERT INTO fw_creations(id,meta,image,image_type,video,video_type) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
      [
        meta.id,
        JSON.stringify(meta),
        Buffer.from(await image.arrayBuffer()),
        image.type,
        video instanceof File ? Buffer.from(await video.arrayBuffer()) : null,
        video instanceof File ? video.type : null,
      ],
    );
    return c.json({ ok: true, id: meta.id });
  });
  app.get("/api/creations/:id/:media", async (c) => {
    const id = uuid.parse(c.req.param("id"));
    const media = z.enum(["image", "video"]).parse(c.req.param("media"));
    const r = await db.pool.query(
      `SELECT ${media} AS data,${media}_type AS type FROM fw_creations WHERE id=$1`,
      [id],
    );
    const row = r.rows[0];
    if (!row?.data) throw new ApiError("NOT_FOUND", 404);
    const data: Buffer = row.data;
    const headers = {
      "Content-Type": String(row.type),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    const range = c.req.header("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return c.body(null, 416);
      const start = Number(match[1]);
      const end = Math.min(
        match[2] ? Number(match[2]) : data.length - 1,
        data.length - 1,
      );
      if (start > end || start >= data.length) return c.body(null, 416);
      return new Response(new Uint8Array(data.subarray(start, end + 1)), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${data.length}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
    return new Response(new Uint8Array(data), {
      headers: { ...headers, "Content-Length": String(data.length) },
    });
  });
  app.onError((e, c) => {
    if (e instanceof ApiError)
      return c.json({ error: { code: e.code } }, e.status as 400);
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return c.json({ error: { code: "INVALID_INPUT" } }, 400);
    console.error("request_failed", e instanceof Error ? e.name : "unknown");
    return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
  });
  return { app, cleanup: () => sessions.cleanup() };
}
