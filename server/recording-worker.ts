import { randomUUID } from "node:crypto";
import type { Database } from "./db";
import { finalizeRecording } from "./recording";

/** A durable DB lease allows recovery after restart, including with a shared local/cloud DB. */
export class RecordingWorker {
  private running = false;
  constructor(private db: Database, private normalize: (data: Buffer, type: string) => Promise<Buffer> = (data, type) => finalizeRecording(data, type, true)) {}
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.pool.query("UPDATE fw_creations SET video_status='failed',video_claim=NULL WHERE video_status='processing' AND video_lease_until<now() AND video_attempts>=3");
      const claim = randomUUID();
      const result = await this.db.pool.query(`WITH next AS (
        SELECT id FROM fw_creations WHERE video IS NOT NULL AND video_attempts<3 AND
        ((video_status='pending' AND (video_retry_at IS NULL OR video_retry_at<=now())) OR
         (video_status='processing' AND video_lease_until<now()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE fw_creations c SET video_status='processing', video_claim=$1,
        video_lease_until=now()+interval '5 minutes',video_attempts=video_attempts+1
        FROM next WHERE c.id=next.id RETURNING c.id,c.video,c.video_type,c.video_attempts`, [claim]);
      const row = result.rows[0];
      if (!row) return;
      const started = Date.now();
      try {
        const output = await this.normalize(row.video, row.video_type);
        await this.db.pool.query(`UPDATE fw_creations SET video=$1,video_type='video/mp4',video_status='ready',video_claim=NULL,video_lease_until=NULL,video_retry_at=NULL WHERE id=$2 AND video_claim=$3`, [output, row.id, claim]);
        console.info("recording_ready", {milliseconds: Date.now()-started, bytes: output.length});
      } catch {
        // Never discard the uploaded video on failure. A later lease may retry the same bytes.
        await this.db.pool.query(`UPDATE fw_creations SET video_status=$1,video_claim=NULL,video_lease_until=NULL,video_retry_at=now()+interval '30 seconds' WHERE id=$2 AND video_claim=$3`, [row.video_attempts>=3 ? "failed" : "pending", row.id, claim]);
        console.error("recording_processing_retry", {attempt: row.video_attempts});
      }
    } finally { this.running = false; }
  }
}
