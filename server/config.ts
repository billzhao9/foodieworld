import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
const accessSchema = z.object({ password: z.string(), secret: z.string() });
export function loadConfig() {
  mkdirSync(".data", { recursive: true, mode: 0o700 });
  const file = ".data/access.json";
  const access = existsSync(file)
    ? accessSchema.parse(JSON.parse(readFileSync(file, "utf8")))
    : {
        password: randomBytes(9).toString("base64url"),
        secret: randomBytes(32).toString("hex"),
      };
  if (!existsSync(file))
    writeFileSync(file, JSON.stringify(access), { mode: 0o600 });
  const baseUrl = process.env.MMLONE_BASE_URL || "http://127.0.0.1:3000";
  const upstream = new URL(baseUrl);
  const production = process.env.NODE_ENV === "production";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    upstream.hostname,
  );
  if (
    upstream.username ||
    upstream.password ||
    upstream.search ||
    upstream.hash ||
    upstream.pathname !== "/" ||
    (upstream.protocol !== "https:" &&
      !(upstream.protocol === "http:" && loopback && !production))
  ) {
    throw new Error("INVALID_UPSTREAM_CONFIGURATION");
  }
  return {
    mediaArchive: process.env.MMLONE_MEDIA_ARCHIVE === "true",
    managedLive: process.env.MMLONE_MANAGED_LIVE === "true",
    password: process.env.APP_PASSWORD || access.password,
    secret: process.env.APP_SESSION_SECRET || access.secret,
    databaseUrl: process.env.DATABASE_URL || "",
    baseUrl,
    environment: process.env.MMLONE_ENVIRONMENT || "development",
    apiKey: process.env.MMLONE_API_KEY || "",
    secure: production || process.env.SECURE_COOKIES === "true",
    port: Number(process.env.PORT || 4174),
    host: process.env.HOST || "0.0.0.0",
  };
}
export type Config = Omit<
  ReturnType<typeof loadConfig>,
  "mediaArchive" | "managedLive"
> & { mediaArchive?: boolean; managedLive?: boolean };
