import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Database } from "../server/db";
import { ArchiveWorker } from "../server/archive-worker";
import { MediaArchive } from "../server/media-archive";
import { createApp } from "../server/app";

const config = { password: "test-password", secret: "archive-test-secret", databaseUrl: "", baseUrl: "https://mml.example", apiKey: "private-test-key", secure: false, port: 4174, host: "localhost", environment: "test", mediaArchive: true };
afterEach(() => vi.unstubAllGlobals());

it("imports bytes with scoped immutable hash metadata and no browser credentials", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ assetId: "asset" }), { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  await new MediaArchive(config).save({ requestId: "foodieworld:creation:video", title: "Title", bytes: Buffer.from("video"), mimeType: "video/mp4", kind: "video", fileName: "video.mp4" });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("https://mml.example/v1/enterprise/assets/import");
  expect(init.headers.Authorization).toBe("Bearer private-test-key");
  const metadata = JSON.parse(Buffer.from(init.headers["X-Media-Metadata"], "base64url").toString());
  expect(metadata).toMatchObject({ applicationRef: "foodieworld", expectedBytes: 5, requestId: "foodieworld:creation:video" });
  expect(metadata.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
});

it("never redirects public playback to arbitrary hosts or private asset endpoints", () => {
  const archive = new MediaArchive(config), request = new Request("https://food.test/play?download=1");
  expect(archive.publicationUrl("https://mml.example/media/published/token", request)).toBe("https://mml.example/media/published/token?download=1");
  for (const url of ["https://evil.test/media/published/token", "https://mml.example/v1/enterprise/assets/private/content", "https://mml.example/media/published/token?admin=1"])
    expect(() => archive.publicationUrl(url, request)).toThrow();
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `fw_archive_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool, db: Database;
describe.skipIf(!databaseUrl)("durable enterprise media outbox", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl!); url.searchParams.set("options", `-c search_path=${schema}`);
    db = new Database(url.href); await db.migrate();
  });
  afterAll(async () => { await db?.close(); if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } });
  beforeEach(async () => { await db.pool.query("TRUNCATE fw_creation_likes,fw_creations,fw_logins"); });
  async function insert(scope: string | null = "test") {
    const id = randomUUID(), meta = { id, dishId: "custom", title: "Cloud rice", description: "Test", ingredients: [], animals: [], createdAt: Date.now() };
    await db.pool.query("INSERT INTO fw_creations(id,meta,image,image_type,video,video_type,media_archive_scope) VALUES($1,$2,$3,'image/png',$4,'video/mp4',$5)", [id, meta, Buffer.from("image"), Buffer.from("video"), scope]);
    return id;
  }
  it("moves authoritative references to MML and retains original bytes, publishing only video", async () => {
    const id = await insert();
    const save = vi.fn().mockImplementation(async input => `asset-${input.kind}`), publish = vi.fn().mockResolvedValue("https://mml.example/media/published/result");
    const worker = new ArchiveWorker(db, { save, publish }, "test");
    expect(await worker.tick()).toBe(true);
    expect(await worker.tick()).toBe(false);
    expect(save.mock.calls.map(([input]) => input.requestId)).toEqual([`foodieworld:${id}:image`, `foodieworld:${id}:video`]);
    expect(publish).toHaveBeenCalledExactlyOnceWith("asset-video");
    const row = (await db.pool.query("SELECT * FROM fw_creations WHERE id=$1", [id])).rows[0];
    expect(row).toMatchObject({ media_archive_status: "ready", image_asset_id: "asset-image", video_asset_id: "asset-video" });
    expect(row.video.equals(Buffer.from("video"))).toBe(true);
  });
  it("resumes after a partial archive without uploading the saved image again", async () => {
    await insert(); let failed = false;
    const save = vi.fn().mockImplementation(async input => { if (input.kind === "video" && !failed) { failed = true; throw new Error("temporary"); } return `asset-${input.kind}`; });
    const worker = new ArchiveWorker(db, { save, publish: vi.fn().mockResolvedValue("https://mml.example/media/published/result") }, "test");
    await worker.tick();
    await db.pool.query("UPDATE fw_creations SET media_archive_retry_at=now()");
    await worker.tick();
    expect(save.mock.calls.map(([input]) => input.kind)).toEqual(["image", "video", "video"]);
    expect((await db.pool.query("SELECT media_archive_status FROM fw_creations")).rows[0].media_archive_status).toBe("ready");
  });
  it("never claims another environment or unassigned historical records", async () => {
    await insert("production"); await insert(null);
    const save = vi.fn(), publish = vi.fn();
    expect(await new ArchiveWorker(db, { save, publish }, "test").tick()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("fences a late archive worker after another process reclaims its lease", async () => {
    const id = await insert();
    let release!: (value: string) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const delayed = new Promise<string>(resolve => { release = resolve; });
    const first = new ArchiveWorker(db, { save: vi.fn().mockImplementation(() => { entered(); return delayed; }), publish: vi.fn() }, "test");
    const pending = first.tick(); await started;
    await db.pool.query("UPDATE fw_creations SET media_archive_lease_until=now()-interval '1 second' WHERE id=$1", [id]);
    const second = new ArchiveWorker(db, { save: vi.fn().mockImplementation(async input => `winner-${input.kind}`), publish: vi.fn().mockResolvedValue("https://mml.example/media/published/winner") }, "test");
    await second.tick(); release("late-image"); await pending;
    const row = (await db.pool.query("SELECT image_asset_id,video_asset_id,media_archive_status FROM fw_creations WHERE id=$1", [id])).rows[0];
    expect(row).toMatchObject({ image_asset_id: "winner-image", video_asset_id: "winner-video", media_archive_status: "ready" });
  });
  it("does not fall back to PG media after cloud ownership or revocation", async () => {
    const id = await insert();
    const { app } = createApp(config, db, vi.fn());
    const login = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: config.password }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await db.pool.query("UPDATE fw_creations SET video_asset_id='video-asset',image_asset_id='image-asset' WHERE id=$1", [id]);
    expect((await app.request(`/api/creations/${id}/video`, { headers: { cookie } })).status).toBe(503);
    await db.pool.query("UPDATE fw_creations SET video_publication_url='https://mml.example/media/published/result' WHERE id=$1", [id]);
    const video = await app.request(`/api/creations/${id}/video`, { headers: { cookie } });
    expect(video.status).toBe(307); expect(video.headers.get("location")).toBe("https://mml.example/media/published/result");
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })); vi.stubGlobal("fetch", fetch);
    expect((await app.request(`/api/creations/${id}/image`, { headers: { cookie } })).status).toBe(404);
    expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer private-test-key");
  });
});
