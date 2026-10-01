import type { Database } from "./db";
import { ApiError } from "./upstream";

export async function setCreationLike(db: Database, id: string, visitor: string, liked: boolean) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    // Lock only this creation: repeated requests are idempotent and counts include prior writers.
    const creation = await client.query("SELECT id FROM fw_creations WHERE id=$1 FOR UPDATE", [id]);
    if (!creation.rowCount) throw new ApiError("NOT_FOUND", 404);
    if (liked) await client.query("INSERT INTO fw_creation_likes(creation_id,visitor) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, visitor]);
    else await client.query("DELETE FROM fw_creation_likes WHERE creation_id=$1 AND visitor=$2", [id, visitor]);
    const count = await client.query("SELECT count(*)::int AS count FROM fw_creation_likes WHERE creation_id=$1", [id]);
    await client.query("COMMIT");
    return { liked, likeCount: Number(count.rows[0].count) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
