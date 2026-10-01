import { randomUUID } from "node:crypto";
import type { Database } from "./db";
import type { MediaArchive } from "./media-archive";

type Row = {
  id: string; meta: { title?: string }; image: Buffer | null; image_type: string;
  cover: Buffer | null; cover_type: string | null; video: Buffer | null; video_type: string | null;
  image_asset_id: string | null; cover_asset_id: string | null; video_asset_id: string | null;
  video_publication_url: string | null; media_archive_attempts: number;
};
/** PG is the retry outbox, MML ONE is the authoritative media archive.
 * Existing source bytes are retained until a separately reviewed cleanup. */
export class ArchiveWorker {
  private running = false;
  constructor(private readonly db: Database, private readonly archive: Pick<MediaArchive, "save" | "publish">, private readonly scope: string) {}
  async tick(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await this.db.pool.query("UPDATE fw_creations SET media_archive_status='failed',media_archive_claim=NULL,media_archive_error='archive_attempts_exhausted' WHERE media_archive_scope=$1 AND media_archive_status='processing' AND media_archive_lease_until<now() AND media_archive_attempts>=5", [this.scope]);
      const claim = randomUUID();
      const result = await this.db.pool.query<Row>(`WITH next AS (
        SELECT id FROM fw_creations WHERE media_archive_scope=$1 AND media_archive_attempts<5 AND
        ((media_archive_status='pending' AND (media_archive_retry_at IS NULL OR media_archive_retry_at<=now())) OR
         (media_archive_status='processing' AND media_archive_lease_until<now()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE fw_creations c SET media_archive_status='processing',media_archive_claim=$2,
        media_archive_lease_until=now()+interval '10 minutes',media_archive_attempts=media_archive_attempts+1
        FROM next WHERE c.id=next.id RETURNING c.*`, [this.scope, claim]);
      const row = result.rows[0];
      if (!row) return false;
      try {
        const save = async (role: "image" | "cover" | "video", bytes: Buffer | null, mimeType: string | null, existing: string | null) => {
          if (existing || !bytes) return existing;
          const type = (mimeType || "application/octet-stream").split(";")[0];
          const extension = type === "video/mp4" ? "mp4" : type === "video/webm" ? "webm" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : "bin";
          const assetId = await this.archive.save({ requestId: `foodieworld:${row.id}:${role}`, title: row.meta.title || row.id, bytes, mimeType: type, kind: role === "video" ? "video" : "image", fileName: `${row.id}-${role}.${extension}` });
          // Fence delayed workers and any concurrent rewrite of the fallback original.
          const saved = await this.db.pool.query(`UPDATE fw_creations SET ${role}_asset_id=$1 WHERE id=$2 AND media_archive_claim=$3 AND ${role}=$4 RETURNING id`, [assetId, row.id, claim, bytes]);
          if (!saved.rowCount) throw new Error("ARCHIVE_SOURCE_CHANGED");
          return assetId;
        };
        await save("image", row.image, row.image_type, row.image_asset_id);
        await save("cover", row.cover, row.cover_type, row.cover_asset_id);
        const videoAssetId = await save("video", row.video, row.video_type, row.video_asset_id);
        const publication = videoAssetId ? row.video_publication_url || await this.archive.publish(videoAssetId) : null;
        await this.db.pool.query(`UPDATE fw_creations SET video_publication_url=$1,video_status='ready',media_archive_status='ready',media_archive_claim=NULL,media_archive_lease_until=NULL,media_archive_retry_at=NULL,media_archive_error=NULL WHERE id=$2 AND media_archive_claim=$3`, [publication, row.id, claim]);
      } catch {
        await this.db.pool.query(`UPDATE fw_creations SET media_archive_status=$1,media_archive_claim=NULL,media_archive_lease_until=NULL,media_archive_retry_at=now()+interval '1 minute',media_archive_error='archive_retry_required' WHERE id=$2 AND media_archive_claim=$3`, [row.media_archive_attempts >= 5 ? "failed" : "pending", row.id, claim]);
      }
      return true;
    } finally { this.running = false; }
  }
}
