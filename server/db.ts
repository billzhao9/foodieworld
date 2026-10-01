import pg from "pg";
import type { PoolClient } from "pg";
export class Database {
  readonly pool: pg.Pool;
  constructor(url: string) {
    if (!url) throw new Error("DATABASE_URL_REQUIRED");
    this.pool = new pg.Pool({
      connectionString: url,
      max: 8,
      connectionTimeoutMillis: 10000,
    });
  }
  async migrate() {
    await this.pool.query(`
 CREATE TABLE IF NOT EXISTS fw_voice_requests (key text PRIMARY KEY,state text NOT NULL CHECK (state IN ('pending','done','unknown')),url text,storage_id text,error text,created_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE fw_voice_requests ADD COLUMN IF NOT EXISTS job_id text;
 CREATE TABLE IF NOT EXISTS fw_narrations (id text PRIMARY KEY,audio bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS fw_records (id text PRIMARY KEY,owner text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS fw_live (id text PRIMARY KEY,owner text NOT NULL UNIQUE,craft_id text NOT NULL,request_id text NOT NULL,upstream_id text,expires_at bigint NOT NULL,heartbeat_at bigint NOT NULL,status text NOT NULL);
 ALTER TABLE fw_live ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'development';
 ALTER TABLE fw_live ADD COLUMN IF NOT EXISTS stop_requested boolean NOT NULL DEFAULT false;
 ALTER TABLE fw_live ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;
 CREATE TABLE IF NOT EXISTS fw_managed_sessions (id text PRIMARY KEY,owner text NOT NULL,craft_id text NOT NULL,scope text NOT NULL,language text NOT NULL,request_payload jsonb,upstream_id text,opening_asset_id text,opening_type text NOT NULL DEFAULT 'image/png',state jsonb NOT NULL DEFAULT '{}',creation_id text,stop_requested boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),poll_after timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS fw_managed_sessions_owner ON fw_managed_sessions(owner,scope,created_at DESC);
 CREATE TABLE IF NOT EXISTS fw_managed_commands (session_id text NOT NULL REFERENCES fw_managed_sessions(id),command_id text NOT NULL,prompt text NOT NULL,language text NOT NULL,narration_asset_id text,state text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(session_id,command_id));
 CREATE TABLE IF NOT EXISTS fw_creations (id text PRIMARY KEY,meta jsonb NOT NULL,image bytea NOT NULL,image_type text NOT NULL,video bytea,video_type text,created_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE fw_creations ALTER COLUMN image DROP NOT NULL;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS image_asset_id text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_asset_id text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS cover_asset_id text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_publication_url text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_status text NOT NULL DEFAULT 'pending';
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_scope text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_claim text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_attempts integer NOT NULL DEFAULT 0;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_lease_until timestamptz;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_retry_at timestamptz;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS media_archive_error text;
 CREATE INDEX IF NOT EXISTS fw_creations_archive_queue ON fw_creations(media_archive_scope,media_archive_status,created_at) WHERE media_archive_status IN ('pending','processing');
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_status text NOT NULL DEFAULT 'ready';
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_claim text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_attempts integer NOT NULL DEFAULT 0;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_lease_until timestamptz;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS video_retry_at timestamptz;
 CREATE INDEX IF NOT EXISTS fw_creations_video_queue ON fw_creations(video_status,created_at) WHERE video_status IN ('pending','processing');
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS cover bytea;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS cover_type text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS share_token text;
 CREATE UNIQUE INDEX IF NOT EXISTS fw_creations_share ON fw_creations(share_token) WHERE share_token IS NOT NULL;
 CREATE TABLE IF NOT EXISTS fw_creation_likes (creation_id text NOT NULL REFERENCES fw_creations(id) ON DELETE CASCADE,visitor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(creation_id,visitor));
 CREATE TABLE IF NOT EXISTS fw_logins (bucket text PRIMARY KEY,attempts integer NOT NULL,expires_at bigint NOT NULL);
 `);
  }
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(73214598)");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
