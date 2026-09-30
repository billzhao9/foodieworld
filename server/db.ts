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
 CREATE TABLE IF NOT EXISTS fw_records (id text PRIMARY KEY,owner text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS fw_live (id text PRIMARY KEY,owner text NOT NULL UNIQUE,craft_id text NOT NULL,request_id text NOT NULL,upstream_id text,expires_at bigint NOT NULL,heartbeat_at bigint NOT NULL,status text NOT NULL);
 ALTER TABLE fw_live ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'development';
 ALTER TABLE fw_live ADD COLUMN IF NOT EXISTS stop_requested boolean NOT NULL DEFAULT false;
 CREATE TABLE IF NOT EXISTS fw_creations (id text PRIMARY KEY,meta jsonb NOT NULL,image bytea NOT NULL,image_type text NOT NULL,video bytea,video_type text,created_at timestamptz NOT NULL DEFAULT now());
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
