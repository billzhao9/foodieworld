import { LIVE_ROUND_SECONDS, LIVE_RESERVATION_SECONDS } from "../shared/limits";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connectionSchema, type SessionReply } from "../shared/contracts";
import { Database } from "./db";
import { ApiError, type Upstream } from "./upstream";
import { Crafts } from "./crafts";
const rowSchema = z.object({
  id: z.string(),
  owner: z.string(),
  craft_id: z.string(),
  request_id: z.string(),
  upstream_id: z.string().nullable(),
  expires_at: z.coerce.number(),
  heartbeat_at: z.coerce.number(),
  status: z.string(),
  stop_requested: z.boolean(),
  scope: z.string(),
});
export class LiveSessions {
  constructor(
    readonly db: Database,
    readonly upstream: Upstream,
    readonly crafts: Crafts,
    readonly scope = "development",
  ) {}
  async start(craftId: string, owner: string): Promise<SessionReply> {
    const craft = await this.crafts.read(craftId, owner);
    if (!craft.imageUrl || !craft.opening) throw new ApiError("NOT_READY", 409);
    const id = randomUUID(),
      now = Date.now();
    await this.db.transaction(async (c) => {
      const r = await c.query("SELECT * FROM fw_live");
      if (r.rows.some((x) => x.owner === owner))
        throw new ApiError("SESSION_EXISTS", 409);
      if ((r.rowCount ?? 0) >= 2) throw new ApiError("KITCHEN_FULL", 429);
      await c.query(
        "INSERT INTO fw_live(id,owner,craft_id,request_id,expires_at,heartbeat_at,status,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          owner,
          craftId,
          `fw_live_${id}`,
          now + 180000,
          now,
          "creating",
          this.scope,
        ],
      );
    });
    try {
      const raw = z
        .object({ sessionId: z.string(), connection: connectionSchema })
        .parse(
          await this.upstream("/live-sessions", {
            requestId: `fw_live_${id}`,
            prompt: craft.opening.videoPrompt,
            model: "visko-orbis-stable",
            seconds: LIVE_RESERVATION_SECONDS,
            options: {
              audioEnabled: true,
              passthrough: true,
              resolution: "auto",
            },
            inputCounts: { image: 1 },
            endUserRef: "_enterprise",
          }),
        );
      const expiresAt = Date.now() + LIVE_ROUND_SECONDS * 1000;
      const updated = await this.db.pool.query(
        "UPDATE fw_live SET upstream_id=$1,expires_at=$2,status='active',heartbeat_at=$3 WHERE id=$4 RETURNING stop_requested",
        [raw.sessionId, expiresAt, Date.now(), id],
      );
      if (updated.rows[0]?.stop_requested) {
        await this.stop(id, owner);
        throw new ApiError("SESSION_ENDED", 409);
      }
      return { id, connection: raw.connection, expiresAt };
    } catch (e) {
      // A known rejection creates no paid session. Unknown transport outcomes keep their recovery key.
      if (
        e instanceof ApiError &&
        [400, 401, 402, 403, 404, 422, 429].includes(e.status)
      )
        await this.db.pool.query("DELETE FROM fw_live WHERE id=$1", [id]);
      else
        await this.db.pool.query(
          "UPDATE fw_live SET status='uncertain',stop_requested=true WHERE id=$1",
          [id],
        );
      throw e;
    }
  }
  async assertActive(id: string, owner: string) {
    const r = await this.db.pool.query(
      "SELECT * FROM fw_live WHERE id=$1 AND owner=$2 AND scope=$3",
      [id, owner, this.scope],
    );
    if (!r.rows[0]) throw new ApiError("SESSION_ENDED", 409);
    const row = rowSchema.parse(r.rows[0]);
    if (
      row.status !== "active" ||
      row.stop_requested ||
      row.expires_at <= Date.now()
    )
      throw new ApiError("SESSION_ENDED", 409);
    return row;
  }
  async heartbeat(id: string, owner: string) {
    await this.assertActive(id, owner);
    await this.db.pool.query(
      "UPDATE fw_live SET heartbeat_at=$1 WHERE id=$2 AND owner=$3",
      [Date.now(), id, owner],
    );
  }
  async stop(id: string, owner: string) {
    const r = await this.db.pool.query(
      "UPDATE fw_live SET stop_requested=true WHERE id=$1 AND owner=$2 AND scope=$3 RETURNING *",
      [id, owner, this.scope],
    );
    if (!r.rows[0]) return;
    const row = rowSchema.parse(r.rows[0]);
    if (!row.upstream_id) {
      await this.db.pool.query(
        "UPDATE fw_live SET status='uncertain' WHERE id=$1",
        [id],
      );
      return;
    }
    await this.upstream(
      `/live-sessions/${encodeURIComponent(row.upstream_id)}/stop`,
      { endUserRef: "_enterprise" },
    );
    await this.db.pool.query("DELETE FROM fw_live WHERE id=$1", [id]);
  }
  async cleanup() {
    const now = Date.now();
    const r = await this.db.pool.query(
      "SELECT * FROM fw_live WHERE scope=$1 AND (expires_at<$2 OR (status='active' AND heartbeat_at<$3) OR (status='uncertain' AND heartbeat_at<$3))",
      [this.scope, now, now - 20000],
    );
    for (const data of r.rows) {
      const row = rowSchema.parse(data);
      try {
        if (row.upstream_id) {
          await this.stop(row.id, row.owner);
          continue;
        }
        const lookup = z
          .object({ sessions: z.array(z.object({ sessionId: z.string() })) })
          .parse(
            await this.upstream(
              `/live-sessions?requestId=${encodeURIComponent(row.request_id)}`,
            ),
          );
        if (lookup.sessions[0]) {
          await this.db.pool.query(
            "UPDATE fw_live SET upstream_id=$1 WHERE id=$2",
            [lookup.sessions[0].sessionId, row.id],
          );
          await this.stop(row.id, row.owner);
        } else if (row.expires_at < now)
          await this.db.pool.query("DELETE FROM fw_live WHERE id=$1", [row.id]);
      } catch {
        console.error("live_cleanup_pending", row.id);
      }
    }
  }
}
