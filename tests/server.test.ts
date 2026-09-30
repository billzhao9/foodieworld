import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import pg from "pg";
import { Database } from "../server/db";
import { createApp } from "../server/app";
import { Crafts } from "../server/crafts";
import { LiveSessions } from "../server/live";
import { randomUUID } from "node:crypto";
const url = process.env.TEST_DATABASE_URL;
const schema = `fw_test_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool, db: Database;
const config = {
  environment: "development",
  password: "test-password",
  secret: "test-secret-at-least-32-characters",
  databaseUrl: "",
  baseUrl: "http://upstream.test",
  apiKey: "test",
  secure: false,
  port: 4174,
  host: "127.0.0.1",
};
const opening = {
  title: "星星饭",
  titleEn: "Star rice",
  description: "暖暖的米饭",
  descriptionEn: "Warm rice",
  imagePrompt: "soft 3d rice image on a plate",
  videoPrompt: "The rice gently steams on a plate.",
};
describe.skipIf(!url)("PostgreSQL app integration", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const u = new URL(url!);
    u.searchParams.set("options", `-c search_path=${schema}`);
    db = new Database(u.href);
    await db.migrate();
  });
  afterAll(async () => {
    await db?.close();
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.pool.query("TRUNCATE fw_records,fw_live,fw_creations,fw_logins");
  });
  async function auth(app: ReturnType<typeof createApp>["app"]) {
    const r = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: config.password }),
    });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")!.split(";")[0];
  }
  it("guards generation/media and rejects wrong passwords and cross-origin mutation", async () => {
    const { app } = createApp(config, db, vi.fn());
    expect((await app.request("/api/creations")).status).toBe(401);
    expect(
      (
        await app.request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ password: "wrong" }),
        })
      ).status,
    ).toBe(401);
    const cookie = await auth(app);
    expect(
      (
        await app.request("/api/crafts", {
          method: "POST",
          headers: {
            cookie,
            origin: "https://evil.test",
            host: "kitchen.test",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request("/api/creations", { headers: { cookie } })).status,
    ).toBe(200);
  });
  it("persists opening/job and does not buy another image on replay", async () => {
    const up = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify(opening) })
      .mockResolvedValueOnce({ jobId: "img1" });
    const crafts = new Crafts(db, up);
    const id = randomUUID();
    await crafts.create(id, "owner", ["米饭", "鸡蛋"]);
    await crafts.prepare(id, "owner");
    await crafts.prepare(id, "owner");
    expect(up).toHaveBeenCalledTimes(2);
    await expect(crafts.create(id, "owner", ["牛肉"])).rejects.toThrow(
      "REQUEST_CONFLICT",
    );
    await expect(crafts.read(id, "other")).rejects.toThrow("NOT_FOUND");
  });
  it("atomically reserves only two live slots across app instances", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const up = vi.fn(async () => {
      await gate;
      return {
        sessionId: "upstream",
        connection: {
          protocol: "webrtc",
          apiBase: "https://api.reactor.inc",
          sessionId: "provider",
          jwt: "test",
          modelSlug: "reactor/visko-orbis-stable",
        },
      };
    });
    const crafts = new Crafts(db, up);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (let i = 0; i < 3; i++) {
      await crafts.create(ids[i], `owner${i}`, ["米饭"]);
      await crafts.update(ids[i], `owner${i}`, (c) => {
        c.opening = opening;
        c.imageUrl = "https://assets.test/image.png";
        c.phase = "ready";
      });
    }
    const a = new LiveSessions(db, up, crafts),
      b = new LiveSessions(db, up, crafts);
    const one = a.start(ids[0], "owner0"),
      two = b.start(ids[1], "owner1");
    await vi.waitFor(() => expect(up).toHaveBeenCalledTimes(2));
    await expect(a.start(ids[2], "owner2")).rejects.toThrow("KITCHEN_FULL");
    await expect(b.start(ids[0], "owner0")).rejects.toThrow("SESSION_EXISTS");
    release();
    await Promise.all([one, two]);
  });
  it("serializes additions and only applies one acknowledged action", async () => {
    const up = vi
      .fn()
      .mockResolvedValue({
        text: JSON.stringify({
          title: "芝士饭",
          titleEn: "Cheese rice",
          description: "芝士加入啦",
          descriptionEn: "Cheese added",
          prompt: "Melted cheese pours onto the rice.",
        }),
      });
    const c = new Crafts(db, up),
      id = randomUUID(),
      action = randomUUID();
    await c.create(id, "a", ["米饭"]);
    await c.update(id, "a", (s) => {
      s.opening = opening;
    });
    await c.action(id, "a", action, "芝士");
    await expect(c.action(id, "a", randomUUID(), "榴莲")).rejects.toThrow(
      "IN_PROGRESS",
    );
    await c.acknowledge(id, "a", action);
    await c.acknowledge(id, "a", action);
    expect((await c.read(id, "a")).additions).toEqual(["芝士"]);
    expect(up).toHaveBeenCalledTimes(1);
  });
  it("cleans an expired session and preserves it when stop fails", async () => {
    const up = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    const sessions = new LiveSessions(db, up, new Crafts(db, up));
    await db.pool.query(
      "INSERT INTO fw_live(id,owner,craft_id,request_id,upstream_id,expires_at,heartbeat_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        "owner",
        "craft",
        "req",
        "provider",
        Date.now() - 1,
        Date.now(),
        "active",
      ],
    );
    await sessions.cleanup();
    expect((await db.pool.query("SELECT * FROM fw_live")).rowCount).toBe(1);
    await sessions.cleanup();
    expect((await db.pool.query("SELECT * FROM fw_live")).rowCount).toBe(0);
  });
  it("stores bytes shared between app instances and supports video range playback", async () => {
    const first = createApp(config, db, vi.fn()).app,
      second = createApp(config, db, vi.fn()).app;
    const cookie = await auth(first);
    const id = randomUUID();
    const form = new FormData();
    form.append(
      "meta",
      JSON.stringify({
        id,
        dishId: "custom",
        baseIngredients: ["米饭"],
        title: "饭",
        description: "test",
        ingredients: [],
        createdAt: Date.now(),
      }),
    );
    form.append(
      "image",
      new Blob(["image-bytes"], { type: "image/png" }),
      "image.png",
    );
    form.append(
      "video",
      new Blob(["video-bytes"], { type: "video/webm" }),
      "video.webm",
    );
    expect(
      (
        await first.request("/api/creations", {
          method: "POST",
          headers: { cookie },
          body: form,
        })
      ).status,
    ).toBe(200);
    const list = await (
      await second.request("/api/creations", { headers: { cookie } })
    ).json();
    expect(list[0].hasVideo).toBe(true);
    const r = await second.request(`/api/creations/${id}/video`, {
      headers: { cookie, range: "bytes=0-4" },
    });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("video");
  });
});
