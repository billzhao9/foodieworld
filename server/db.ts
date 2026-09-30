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
 CREATE TABLE IF NOT EXISTS fw_creations (id text PRIMARY KEY,meta jsonb NOT NULL,image bytea NOT NULL,image_type text NOT NULL,video bytea,video_type text,created_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS cover bytea;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS cover_type text;
 ALTER TABLE fw_creations ADD COLUMN IF NOT EXISTS share_token text;
 CREATE UNIQUE INDEX IF NOT EXISTS fw_creations_share ON fw_creations(share_token) WHERE share_token IS NOT NULL;
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
