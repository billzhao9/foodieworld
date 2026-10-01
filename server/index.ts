import { ArchiveWorker } from "./archive-worker";
import { MediaArchive } from "./media-archive";
import { RecordingWorker } from "./recording-worker";
import { makeMmlNarration } from "./mml-narration";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadConfig } from "./config";
import { Database } from "./db";
import { createApp } from "./app";
const config = loadConfig();
const db = new Database(config.databaseUrl);
await db.migrate();
const narrator =
  process.env.NARRATION_PROVIDER === "mmlone" ||
  process.env.NODE_ENV === "production"
    ? makeMmlNarration(config, db)
    : undefined;
const { app, cleanup, managedCleanup } = createApp(
  config,
  db,
  undefined,
  narrator,
);
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));
let cleaning = false;
const timer = setInterval(() => {
  if (cleaning) return;
  cleaning = true;
  void cleanup()
    .catch(() => console.error("cleanup_failed"))
    .finally(() => {
      cleaning = false;
    });
}, 5000);
const managedTimer = setInterval(() => {
  void managedCleanup().catch(() => console.error("managed_cleanup_failed"));
}, 5000);
const recordingWorker = new RecordingWorker(db);
const archiveWorker = config.mediaArchive
  ? new ArchiveWorker(db, new MediaArchive(config), config.environment)
  : null;
const recordingTimer = setInterval(() => {
  if (archiveWorker)
    void archiveWorker
      .tick()
      .catch(() => console.error("archive_worker_failed"));
  else
    void recordingWorker
      .tick()
      .catch(() => console.error("recording_worker_failed"));
}, 2000);
const server = serve(
  { fetch: app.fetch, port: config.port, hostname: config.host },
  () =>
    console.log(
      `FoodieWorld: http://${config.host}:${config.port} (password: .data/access.json or APP_PASSWORD)`,
    ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    clearInterval(timer);
    clearInterval(recordingTimer);
    clearInterval(managedTimer);
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
  });
