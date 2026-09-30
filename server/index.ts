import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadConfig } from "./config";
import { Database } from "./db";
import { createApp } from "./app";
const config = loadConfig();
const db = new Database(config.databaseUrl);
await db.migrate();
const { app, cleanup } = createApp(config, db);
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
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
  });
