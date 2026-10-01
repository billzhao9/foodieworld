import { localizeManagedPlaylist } from "./managed-playlist";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";
import type { Database } from "./db";
import type { Crafts } from "./crafts";
import type { Narrations, NarrationLanguage } from "./narration";
import { MediaArchive } from "./media-archive";
import { ApiError, type Upstream } from "./upstream";
import type { ManagedSessionStatus } from "../shared/contracts";
import { LIVE_RESERVATION_SECONDS, LIVE_ROUND_SECONDS } from "../shared/limits";

const statusSchema = z.object({
  status: z.enum(["queued", "running", "stopping", "ended", "failed"]),
  recordingStatus: z.enum([
    "pending",
    "capturing",
    "persisting",
    "playable",
    "failed",
  ]),
  deadline: z.number().optional(),
  readyAt: z.number().optional(),
  assetId: z.string().optional(),
  error: z.string().optional(),
  playbackUrl: z.string(),
  commands: z
    .array(
      z.object({
        commandId: z.string(),
        sequence: z.number(),
        status: z.enum(["accepted", "sent", "ack", "failed", "unknown"]),
      }),
    )
    .default([]),
});
type Row = {
  id: string;
  owner: string;
  craft_id: string;
  scope: string;
  language: NarrationLanguage;
  request_payload: Record<string, unknown> | null;
  upstream_id: string | null;
  opening_asset_id: string | null;
  opening_type: string;
  state: Record<string, unknown>;
  creation_id: string | null;
  stop_requested: boolean;
  created_at: Date;
};
type Command = {
  command_id: string;
  prompt: string;
  language: NarrationLanguage;
  narration_asset_id: string | null;
  state: string;
};

/** Browser is a viewer. Durable control and final files live in MML ONE. */
export class ManagedSessions {
  private polling = false;
  private connections = new Map<string, Promise<void>>();
  private voices = new Map<string, Promise<void>>();
  private viewers = new Map<string, { url: string; expiresAt: number }>();
  readonly archive: MediaArchive;
  constructor(
    readonly config: Config,
    readonly db: Database,
    readonly upstream: Upstream,
    readonly crafts: Crafts,
    readonly narrations: Narrations,
    archive?: MediaArchive,
  ) {
    this.archive = archive ?? new MediaArchive(config);
  }
  async owned(id: string, owner: string): Promise<Row> {
    const result = await this.db.pool.query<Row>(
      "SELECT * FROM fw_managed_sessions WHERE id=$1 AND owner=$2 AND scope=$3",
      [id, owner, this.config.environment],
    );
    if (!result.rows[0]) throw new ApiError("SESSION_ENDED", 409);
    return result.rows[0];
  }
  private playback(value: string): string {
    const url = new URL(value, this.config.baseUrl);
    if (
      url.origin !== new URL(this.config.baseUrl).origin ||
      !/^\/media\/live\/[^/]+\/index\.m3u8$/.test(url.pathname) ||
      url.username ||
      url.password
    )
      throw new ApiError("INVALID_MANAGED_PLAYBACK", 502);
    return url.href;
  }
  async start(
    craftId: string,
    owner: string,
    language: NarrationLanguage,
  ): Promise<ManagedSessionStatus> {
    if (!this.config.mediaArchive)
      throw new ApiError("MANAGED_ARCHIVE_REQUIRED", 503);
    const craft = await this.crafts.read(craftId, owner);
    if (!craft.imageUrl || !craft.opening) throw new ApiError("NOT_READY", 409);
    const id = randomUUID(),
      now = Date.now();
    await this.db.transaction(async (c) => {
      const active = await c.query("SELECT owner FROM fw_live");
      if (active.rows.some((row) => row.owner === owner))
        throw new ApiError("SESSION_EXISTS", 409);
      if (active.rows.length >= 2) throw new ApiError("KITCHEN_FULL", 429);
      await c.query(
        "INSERT INTO fw_live(id,owner,craft_id,request_id,expires_at,heartbeat_at,status,scope,managed) VALUES($1,$2,$3,$4,$5,$6,'creating',$7,true)",
        [
          id,
          owner,
          craftId,
          `fw_managed_${id}`,
          now + 180000,
          now,
          this.config.environment,
        ],
      );
      await c.query(
        "INSERT INTO fw_managed_sessions(id,owner,craft_id,scope,language) VALUES($1,$2,$3,$4,$5)",
        [id, owner, craftId, this.config.environment, language],
      );
    });
    try {
      const image = await this.downloadOpening(craft.imageUrl);
      const openingAssetId = await this.archive.save({
        requestId: `foodieworld:${id}:opening`,
        title: craft.opening.title,
        bytes: image.bytes,
        mimeType: image.type,
        kind: "image",
        fileName: `${id}-opening`,
      });
      await this.db.pool.query(
        "UPDATE fw_managed_sessions SET opening_asset_id=$1,opening_type=$2 WHERE id=$3",
        [openingAssetId, image.type, id],
      );
      // Persist narration before buying a live round, and bind it into the same creation request.
      const audio = await this.narrations.get(craftId, owner, language);
      const audioType =
        audio.toString("ascii", 0, 4) === "RIFF" ? "audio/wav" : "audio/mpeg";
      const openingNarrationAssetId = await this.archive.save({
        requestId: `foodieworld:${id}:opening-voice:${language}`,
        title: "Foodie World narration",
        bytes: audio,
        mimeType: audioType,
        kind: "audio",
        fileName: `${id}-opening-voice`,
      });
      const payload = {
        requestId: `fw_managed_${id}`,
        prompt: craft.opening.videoPrompt,
        model: "visko-orbis-stable",
        seconds: LIVE_RESERVATION_SECONDS,
        options: { audioEnabled: true, passthrough: true, resolution: "1080p" },
        inputCounts: { image: 1 },
        endUserRef: "_enterprise",
        managed: {
          openingAssetId,
          openingNarrationAssetId,
          audioPrompt:
            craft.opening.effectsPrompt ||
            "Natural kitchen sounds, sizzling, playful animal sounds when present. No human speech or vocals.",
          title: craft.opening.title,
          applicationRef: "foodieworld",
          durationSeconds: LIVE_ROUND_SECONDS,
        },
      };
      // Recovery reuses this exact payload and request ID; never reconstruct it from edited craft state.
      await this.db.pool.query(
        "UPDATE fw_managed_sessions SET request_payload=$1 WHERE id=$2",
        [payload, id],
      );
      await this.connect(await this.owned(id, owner));
      return (await this.status(id, owner)).session;
    } catch (error) {
      const row = await this.owned(id, owner);
      if (
        !row.request_payload ||
        (!row.upstream_id &&
          error instanceof ApiError &&
          [400, 401, 402, 403, 404, 422, 429].includes(error.status))
      ) {
        await this.db.pool.query(
          "UPDATE fw_managed_sessions SET state=$1 WHERE id=$2",
          [{ status: "failed", recordingStatus: "failed", commands: [] }, id],
        );
        await this.db.pool.query("DELETE FROM fw_live WHERE id=$1", [id]);
      }
      // Unknown creation remains recoverable with the same upstream request ID.
      throw error;
    }
  }
  private async connect(row: Row) {
    const pending = this.connections.get(row.id);
    if (pending) return pending;
    const work = this.connectOnce(row).catch((error: unknown) => {
      // Another process may still own the same idempotent admission. Never
      // replace its request ID or interpret its pending result as failure.
      if (error instanceof ApiError && error.status === 409 && error.code === "request_in_progress") return;
      throw error;
    }).finally(() => this.connections.delete(row.id));
    this.connections.set(row.id, work);
    return work;
  }
  private async connectOnce(row: Row) {
    if (row.upstream_id || !row.request_payload) return;
    // Even a requested stop must recover the original idempotent creation: the
    // server may have accepted it before its reply was lost.
    const opened = z
      .object({
        sessionId: z.string(),
        managed: z.literal(true),
        playbackUrl: z.string(),
      })
      .parse(await this.upstream("/live-sessions", row.request_payload));
    await this.db.pool.query(
      "UPDATE fw_managed_sessions SET upstream_id=$1,updated_at=now() WHERE id=$2 AND upstream_id IS NULL",
      [opened.sessionId, row.id],
    );
    await this.db.pool.query(
      "UPDATE fw_live SET upstream_id=$1,status='active',expires_at=$2 WHERE id=$3",
      [opened.sessionId, Date.now() + LIVE_ROUND_SECONDS * 1000, row.id],
    );
  }
  async queue(
    id: string,
    owner: string,
    commandId: string,
    prompt: string,
    language: NarrationLanguage,
    dispatch = true,
  ) {
    const row = await this.owned(id, owner);
    await this.db.pool.query(
      "INSERT INTO fw_managed_commands(session_id,command_id,prompt,language) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [id, commandId, prompt, language],
    );
    const saved = await this.db.pool.query<Command>(
      "SELECT * FROM fw_managed_commands WHERE session_id=$1 AND command_id=$2",
      [id, commandId],
    );
    const command = saved.rows[0];
    if (command.prompt !== prompt || command.language !== language)
      throw new ApiError("REQUEST_CONFLICT", 409);
    await this.prepareVoice(row, command);
    if (dispatch) await this.dispatch(row, commandId);
  }
  private async prepareVoice(row: Row, command: Command) {
    const key = `${row.id}:${command.command_id}`;
    const pending = this.voices.get(key);
    if (pending) return pending;
    const work = this.prepareVoiceOnce(row, command).finally(() => this.voices.delete(key));
    this.voices.set(key, work);
    return work;
  }
  private async prepareVoiceOnce(row: Row, command: Command) {
    if (command.narration_asset_id) return;
    const fresh = await this.db.pool.query<Command>(
      "SELECT * FROM fw_managed_commands WHERE session_id=$1 AND command_id=$2",
      [row.id, command.command_id],
    );
    if (fresh.rows[0]?.narration_asset_id) return;
    const audio = await this.narrations.get(
      row.craft_id,
      row.owner,
      command.language,
      command.command_id === "opening" ? undefined : command.command_id,
    );
    const type =
      audio.toString("ascii", 0, 4) === "RIFF" ? "audio/wav" : "audio/mpeg";
    const asset = await this.archive.save({
      requestId: `foodieworld:${row.id}:voice:${command.command_id}:${command.language}`,
      title: "Foodie World narration",
      bytes: audio,
      mimeType: type,
      kind: "audio",
      fileName: `${row.id}-${command.command_id}.${type === "audio/wav" ? "wav" : "mp3"}`,
    });
    await this.db.pool.query(
      "UPDATE fw_managed_commands SET narration_asset_id=$1 WHERE session_id=$2 AND command_id=$3 AND narration_asset_id IS NULL",
      [asset, row.id, command.command_id],
    );
  }
  private async dispatch(row: Row, commandId?: string) {
    if (!row.upstream_id || row.stop_requested) return;
    const commands = await this.db.pool.query<Command>(
      "SELECT * FROM fw_managed_commands WHERE session_id=$1 AND state='pending' ORDER BY created_at,command_id",
      [row.id],
    );
    for (const command of commands.rows) {
      if (commandId && command.command_id !== commandId) continue;
      await this.prepareVoice(row, command);
      const fresh = (
        await this.db.pool.query<Command>(
          "SELECT * FROM fw_managed_commands WHERE session_id=$1 AND command_id=$2",
          [row.id, command.command_id],
        )
      ).rows[0];
      const current = await this.owned(row.id, row.owner);
      if (current.stop_requested || ["ended", "failed", "stopping"].includes(String(current.state.status)) ||
          (typeof current.state.deadline === "number" && current.state.deadline <= Date.now())) {
        await this.db.pool.query("UPDATE fw_managed_commands SET state='cancelled' WHERE session_id=$1 AND command_id=$2", [row.id, command.command_id]);
        throw new ApiError("SESSION_ENDED", 409);
      }
      await this.upstream(
        `/managed-live-sessions/${encodeURIComponent(row.upstream_id)}/commands`,
        {
          commandId: command.command_id,
          prompt: command.prompt,
          narrationAssetId: fresh.narration_asset_id,
        },
      );
      await this.db.pool.query(
        "UPDATE fw_managed_commands SET state='sent' WHERE session_id=$1 AND command_id=$2",
        [row.id, command.command_id],
      );
    }
  }
  async status(id: string, owner: string) {
    let row = await this.owned(id, owner);
    if (!row.upstream_id && row.state.status !== "failed") {
      await this.connect(row);
      row = await this.owned(id, owner);
    }
    if (!row.upstream_id)
      return {
        session: {
          id,
          managed: true as const,
          expiresAt: row.created_at.getTime() + 180000,
          playbackUrl: "",
          status:
            row.state.status === "failed"
              ? ("failed" as const)
              : ("queued" as const),
          recordingStatus:
            row.state.status === "failed"
              ? ("failed" as const)
              : ("pending" as const),
          commands: [],
        },
        craft: await this.crafts.read(row.craft_id, owner),
        craftId: row.craft_id,
      };
    const value = statusSchema.parse(
      await this.upstream(
        `/managed-live-sessions/${encodeURIComponent(row.upstream_id)}`,
      ),
    );
    const { playbackUrl, ...stored } = value;
    this.viewers.set(id, {
      url: this.playback(playbackUrl),
      expiresAt: Date.now() + 30000,
    });
    await this.db.pool.query(
      "UPDATE fw_managed_sessions SET state=$1,updated_at=now() WHERE id=$2",
      [stored, id],
    );
    for (const command of value.commands) {
      if (command.status !== "ack" || command.commandId === "opening") continue;
      const registered = await this.db.pool.query(
        "SELECT 1 FROM fw_managed_commands WHERE session_id=$1 AND command_id=$2",
        [id, command.commandId],
      );
      if (registered.rowCount)
        await this.crafts.acknowledge(row.craft_id, owner, command.commandId);
    }
    if (["ended", "failed"].includes(value.status))
      await this.db.pool.query("DELETE FROM fw_live WHERE id=$1", [id]);
    else {
      if (value.deadline)
        await this.db.pool.query(
          "UPDATE fw_live SET expires_at=$1 WHERE id=$2",
          [value.deadline, id],
        );
      if (row.stop_requested)
        await this.upstream(
          `/managed-live-sessions/${encodeURIComponent(row.upstream_id)}/stop`,
          {},
        );
      else {
        // Recover the narrow crash window between persisting an LLM action and
        // inserting its outbound command. The prepared action is never regenerated.
        const craft = await this.crafts.read(row.craft_id, owner);
        for (const commandId of craft.actionOrder) {
          const action = craft.actions[commandId];
          if (action?.state !== "ready" || !action.result) continue;
          const queued = await this.db.pool.query(
            "SELECT 1 FROM fw_managed_commands WHERE session_id=$1 AND command_id=$2",
            [id, commandId],
          );
          if (!queued.rowCount)
            await this.queue(
              id,
              owner,
              commandId,
              action.result.prompt,
              row.language,
              false,
            );
        }
        await this.dispatch(row);
      }
    }
    let creationId = row.creation_id ?? undefined;
    if (value.assetId && value.recordingStatus === "playable" && !creationId)
      creationId = await this.finalize(row, value.assetId);
    const session: ManagedSessionStatus = {
      ...stored,
      id,
      managed: true,
      expiresAt:
        value.deadline ?? row.created_at.getTime() + LIVE_ROUND_SECONDS * 1000,
      playbackUrl: `/api/live/${encodeURIComponent(id)}/stream/index.m3u8`,
      creationId,
    };
    return {
      session,
      craft: await this.crafts.read(row.craft_id, owner),
      craftId: row.craft_id,
    };
  }
  private async finalize(row: Row, assetId: string): Promise<string> {
    const publication = await this.archive.publish(assetId);
    const craft = await this.crafts.read(row.craft_id, row.owner);
    if (!craft.opening || !row.opening_asset_id)
      throw new ApiError("NOT_READY", 409);
    const meta = {
      id: row.id,
      dishId: craft.dishId,
      baseIngredients: craft.baseIngredients,
      cookware: craft.cookware,
      title: craft.opening.title,
      titleEn: craft.opening.titleEn,
      description: craft.opening.description,
      descriptionEn: craft.opening.descriptionEn,
      ingredients: craft.additions,
      animals: craft.animals,
      createdAt: row.created_at.getTime(),
    };
    await this.db.transaction(async (c) => {
      await c.query(
        "INSERT INTO fw_creations(id,meta,image,image_type,image_asset_id,video_asset_id,video_publication_url,video_status,media_archive_status,media_archive_scope,share_token) VALUES($1,$2,NULL,$3,$4,$5,$6,'ready','ready',$7,$8) ON CONFLICT(id) DO NOTHING",
        [
          row.id,
          meta,
          row.opening_type,
          row.opening_asset_id,
          assetId,
          publication,
          row.scope,
          randomBytes(32).toString("base64url"),
        ],
      );
      await c.query(
        "UPDATE fw_managed_sessions SET creation_id=$1 WHERE id=$1",
        [row.id],
      );
    });
    return row.id;
  }
  async recover(owner: string) {
    const result = await this.db.pool.query<{ id: string }>(
      "SELECT id FROM fw_managed_sessions WHERE owner=$1 AND scope=$2 ORDER BY created_at DESC LIMIT 1",
      [owner, this.config.environment],
    );
    return result.rows[0] ? this.status(result.rows[0].id, owner) : null;
  }
  async stop(id: string, owner: string) {
    const row = await this.owned(id, owner);
    await this.db.pool.query(
      "UPDATE fw_managed_sessions SET stop_requested=true WHERE id=$1",
      [id],
    );
    await this.db.pool.query(
      "UPDATE fw_live SET stop_requested=true WHERE id=$1",
      [id],
    );
    if (row.upstream_id)
      await this.upstream(
        `/managed-live-sessions/${encodeURIComponent(row.upstream_id)}/stop`,
        {},
      );
  }
  async retryArchive(id: string, owner: string) {
    const row = await this.owned(id, owner);
    if (!row.upstream_id) throw new ApiError("NOT_READY", 409);
    await this.upstream(
      `/managed-live-sessions/${encodeURIComponent(row.upstream_id)}/retry-archive`,
      {},
    );
    await this.db.pool.query(
      "UPDATE fw_managed_sessions SET state=jsonb_set(state,'{recordingStatus}','\"pending\"'),poll_after=now() WHERE id=$1",
      [id],
    );
  }
  async cleanup() {
    if (this.polling) return;
    this.polling = true;
    try {
      // A process that died during image/voice preparation never purchased a round.
      const stale = await this.db.pool.query<{ id: string }>(
        "UPDATE fw_managed_sessions SET state=$1 WHERE scope=$2 AND upstream_id IS NULL AND request_payload IS NULL AND created_at<now()-interval '5 minutes' AND COALESCE(state->>'status','queued')!='failed' RETURNING id",
        [
          { status: "failed", recordingStatus: "failed", commands: [] },
          this.config.environment,
        ],
      );
      for (const row of stale.rows)
        await this.db.pool.query("DELETE FROM fw_live WHERE id=$1", [row.id]);
      const result = await this.db.pool.query<{ id: string; owner: string }>(
        "UPDATE fw_managed_sessions SET poll_after=now()+interval '15 seconds' WHERE id IN (SELECT id FROM fw_managed_sessions WHERE scope=$1 AND creation_id IS NULL AND poll_after<=now() AND COALESCE(state->>'recordingStatus','pending')!='failed' ORDER BY created_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING id,owner",
        [this.config.environment],
      );
      for (const row of result.rows)
        try {
          await this.status(row.id, row.owner);
        } catch {
          console.error("managed_live_poll_pending");
        }
    } finally {
      this.polling = false;
    }
  }
  async stream(
    id: string,
    owner: string,
    resource: string,
    request: Request,
  ): Promise<Response> {
    const row = await this.owned(id, owner);
    if (!row.upstream_id || !/^(index\.m3u8|\d+\.m4s)$/.test(resource))
      throw new ApiError("NOT_READY", 404);
    let viewer = this.viewers.get(id);
    if (!viewer || viewer.expiresAt <= Date.now()) {
      const value = z
        .object({ playbackUrl: z.string() })
        .parse(
          await this.upstream(
            `/managed-live-sessions/${encodeURIComponent(row.upstream_id)}`,
          ),
        );
      viewer = {
        url: this.playback(value.playbackUrl),
        expiresAt: Date.now() + 30000,
      };
      this.viewers.set(id, viewer);
    }
    const target = new URL(viewer.url);
    target.pathname = target.pathname.replace(/index\.m3u8$/, resource);
    const resourceToken = new URL(request.url).searchParams.get("r");
    if (resource !== "index.m3u8") {
      if (!resourceToken || resourceToken.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(resourceToken))
        throw new ApiError("INVALID_MANAGED_PLAYBACK", 400);
      target.searchParams.set("r", resourceToken);
    }
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) {
      if (!/^bytes=\d+-\d*$/.test(range))
        throw new ApiError("INVALID_RANGE", 416);
      headers.set("range", range);
    }
    const response = await fetch(target, {
      headers,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      redirect: "error",
    });
    const output = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (resource === "index.m3u8" && response.ok) {
      const text = await response.text();
      if (!text.startsWith("#EXTM3U") || text.length > 200000)
        throw new ApiError("INVALID_MANAGED_PLAYBACK", 502);
      output.set("Content-Type", "application/vnd.apple.mpegurl");
      // Keep every fragment request on this authenticated origin; viewer tickets stay server-side.
      return new Response(
        localizeManagedPlaylist(text),
        { headers: output },
      );
    }
    for (const key of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ]) {
      const value = response.headers.get(key);
      if (value) output.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: output,
    });
  }
  private async downloadOpening(value: string) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !(
        url.origin === new URL(this.config.baseUrl).origin ||
        /\.(convex\.cloud|convex\.site)$/.test(url.hostname)
      ) ||
      url.username ||
      url.password
    )
      throw new ApiError("INVALID_IMAGE_URL", 400);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (
      !response.ok ||
      !["image/png", "image/jpeg", "image/webp"].includes(type) ||
      !response.body
    )
      throw new ApiError("IMAGE_DOWNLOAD_FAILED", 502);
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiError("FILE_TOO_LARGE", 413);
      }
      chunks.push(next.value);
    }
    return { bytes: Buffer.concat(chunks), type };
  }
}
