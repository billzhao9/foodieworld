import { loadConfig } from "../server/config";
import { Database } from "../server/db";
import { MediaArchive } from "../server/media-archive";
import { ArchiveWorker } from "../server/archive-worker";

/** pnpm exec tsx scripts/migrate-media.ts [--apply] [--limit=25] [--retry-failed]
 * Dry run by default. Existing share tokens/likes/IDs/source bytes never change.
 * Run again to resume; upstream imports use creation ID + role idempotency keys.
 */
const config = loadConfig();
const apply = process.argv.includes("--apply");
const retryFailed = process.argv.includes("--retry-failed");
const limit = Number(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 25,
);
if (!Number.isInteger(limit) || limit < 1 || limit > 100)
  throw new Error("LIMIT_MUST_BE_1_TO_100");
if (apply && !config.mediaArchive)
  throw new Error("ENABLE_MMLONE_MEDIA_ARCHIVE_AFTER_UPSTREAM_DEPLOYMENT");
const db = new Database(config.databaseUrl);
try {
  // A dry run must not mutate the schema or assign media to an environment.
  if (apply) await db.migrate();
  let schemaReady = true;
  if (!apply) {
    const columns = await db.pool.query<{ attname: string }>(
      "SELECT attname FROM pg_attribute WHERE attrelid=to_regclass('fw_creations') AND attnum>0 AND NOT attisdropped",
    );
    const available = new Set(columns.rows.map((row) => row.attname));
    const missing = [
      "id",
      "media_archive_scope",
      "media_archive_status",
      "video_status",
      "created_at",
    ].filter((name) => !available.has(name));
    if (missing.length) {
      console.error("MEDIA_MIGRATION_SCHEMA_NOT_READY", {
        missingColumns: missing,
        nextStep:
          "Start the updated FoodieWorld backend with MMLONE_MEDIA_ARCHIVE=false and MMLONE_MANAGED_LIVE=false to apply its additive PostgreSQL schema migration. Then rerun this dry-run. No schema or media was changed by this command.",
      });
      process.exitCode = 2;
      schemaReady = false;
    }
  }
  if (schemaReady) {
    const candidates = await db.pool.query<{ id: string }>(
      `SELECT id FROM fw_creations
    WHERE (media_archive_scope IS NULL OR media_archive_scope=$1)
      AND media_archive_status IN ('pending'${retryFailed ? ",'failed'" : ""})
      AND video_status NOT IN ('processing','pending')
    ORDER BY created_at LIMIT $2`,
      [config.environment, limit],
    );
    console.info("media_migration", {
      mode: apply ? "apply" : "dry-run",
      scope: config.environment,
      candidates: candidates.rowCount,
    });
    if (apply && candidates.rows.length) {
      const ids = candidates.rows.map((row) => row.id);
      await db.pool.query(
        `UPDATE fw_creations SET media_archive_scope=$1,media_archive_status='pending',media_archive_retry_at=NULL${retryFailed ? ",media_archive_attempts=0" : ""} WHERE id=ANY($2::text[]) AND media_archive_status IN ('pending'${retryFailed ? ",'failed'" : ""})`,
        [config.environment, ids],
      );
      const worker = new ArchiveWorker(
        db,
        new MediaArchive(config),
        config.environment,
      );
      for (let i = 0; i < limit; i++) if (!(await worker.tick())) break;
      const result = await db.pool.query(
        "SELECT media_archive_status,count(*)::int AS count FROM fw_creations WHERE id=ANY($1::text[]) GROUP BY media_archive_status",
        [ids],
      );
      console.info("media_migration_result", result.rows);
    }
  }
} finally {
  await db.close();
}
