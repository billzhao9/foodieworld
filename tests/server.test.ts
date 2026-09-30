import { MAX_BASE_INGREDIENTS } from "../shared/limits";
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
import { animalBehaviors } from "../server/prompts";
const { randomPick } = vi.hoisted(() => ({
  randomPick: vi.fn<(max: number) => number>(),
}));
vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return {
    ...original,
    randomInt: randomPick.mockImplementation((max) => original.randomInt(max)),
  };
});
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
  effectsPrompt: "",
  narrationZh: "",
  narrationEn: "",
  audioPromptZh: "",
  audioPromptEn: "",
};
describe.skipIf(!url)("PostgreSQL app integration", { timeout: 20_000 }, () => {
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
    await db.pool.query(
      "TRUNCATE fw_records,fw_live,fw_creations,fw_logins,fw_narrations",
    );
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
  it("preserves large baskets across creation, retries, reload and metadata storage", async () => {
    const upstream = vi.fn();
    const { app } = createApp(config, db, upstream);
    const cookie = await auth(app);
    for (const count of [6, 20, MAX_BASE_INGREDIENTS]) {
      const id = randomUUID();
      const ingredients = Array.from(
        { length: count },
        (_, i) => `食材${i + 1}`,
      );
      const create = (values = ingredients) =>
        app.request("/api/crafts", {
          method: "POST",
          headers: { cookie },
          body: JSON.stringify({ id, ingredients: values }),
        });
      expect((await create()).status).toBe(200);
      expect((await create()).status).toBe(200);
      const restored = await app.request(`/api/crafts/${id}`, {
        headers: { cookie },
      });
      expect(restored.status).toBe(200);
      expect((await restored.json()).baseIngredients).toEqual(ingredients);
      expect((await create([...ingredients].reverse())).status).toBe(409);
      const form = new FormData();
      form.append(
        "meta",
        JSON.stringify({
          id,
          dishId: "custom",
          baseIngredients: ingredients,
          title: "大锅狂想",
          description: "large basket",
          ingredients: [],
          createdAt: Date.now(),
        }),
      );
      form.append(
        "image",
        new Blob(["image"], { type: "image/png" }),
        "image.png",
      );
      expect(
        (
          await app.request("/api/creations", {
            method: "POST",
            headers: { cookie },
            body: form,
          })
        ).status,
      ).toBe(200);
      const list = await (
        await app.request("/api/creations", { headers: { cookie } })
      ).json();
      expect(
        list.find((item: { id: string }) => item.id === id).baseIngredients,
      ).toEqual(ingredients);
    }
    for (const count of [0, MAX_BASE_INGREDIENTS + 1]) {
      expect(
        (
          await app.request("/api/crafts", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
              id: randomUUID(),
              ingredients: Array.from({ length: count }, (_, i) => `食材${i}`),
            }),
          })
        ).status,
      ).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("guards narration ownership, selects language and caches actual audio", async () => {
    const synthesize = vi.fn(async (_text: string, _language: "zh" | "en") =>
      Buffer.from("RIFF-test-WAVE"),
    );
    const { app } = createApp(config, db, vi.fn(), synthesize);
    const cookie = await auth(app),
      otherCookie = await auth(app),
      id = randomUUID();
    await app.request("/api/crafts", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ id, ingredients: ["米饭"] }),
    });
    const line = {
      ...opening,
      narrationZh: "评委先别跑，这锅的惊喜还在后头！",
      narrationEn: "Judges, stay seated. This pan is only warming up!",
    };
    await db.pool.query(
      "UPDATE fw_records SET data=jsonb_set(data,'{opening}',$1::jsonb) WHERE id=$2",
      [JSON.stringify(line), id],
    );
    const request = (language: string, sessionCookie?: string, extra = {}) =>
      app.request(`/api/crafts/${id}/narration`, {
        method: "POST",
        headers: sessionCookie ? { cookie: sessionCookie } : {},
        body: JSON.stringify({ language, ...extra }),
      });
    expect((await request("zh")).status).toBe(401);
    expect((await request("zh", otherCookie)).status).toBe(404);
    expect((await request("fr", cookie)).status).toBe(400);
    expect(
      (await request("zh", cookie, { text: "arbitrary caller text" })).status,
    ).toBe(400);
    expect(synthesize).not.toHaveBeenCalled();
    const first = await request("zh", cookie);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("audio/wav");
    expect(await first.text()).toBe("RIFF-test-WAVE");
    expect((await request("zh", cookie)).status).toBe(200);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenLastCalledWith(line.narrationZh, "zh");
    expect((await request("en", cookie)).status).toBe(200);
    expect(synthesize).toHaveBeenLastCalledWith(line.narrationEn, "en");
    expect(synthesize).toHaveBeenCalledTimes(2);
  });
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
    const largeBasket = Array.from(
      { length: MAX_BASE_INGREDIENTS },
      (_, i) => `食材${i + 1}`,
    );
    await crafts.create(id, "owner", largeBasket);
    await crafts.prepare(id, "owner");
    await crafts.prepare(id, "owner");
    expect(up).toHaveBeenCalledTimes(2);
    expect(up.mock.calls[0][1].prompt).toContain(JSON.stringify(largeBasket));
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
    await vi.waitFor(() => expect(up).toHaveBeenCalledTimes(2), {
      timeout: 5000,
    });
    await expect(a.start(ids[2], "owner2")).rejects.toThrow("KITCHEN_FULL");
    await expect(b.start(ids[0], "owner0")).rejects.toThrow("SESSION_EXISTS");
    release();
    await Promise.all([one, two]);
  });
  it("serializes additions and only applies one acknowledged action", async () => {
    const up = vi.fn().mockResolvedValue({
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
  it("persists a random animal behavior across failure/retry and keeps animal ACKs separate and ordered", async () => {
    const pick = randomPick;
    pick.mockReturnValueOnce(5).mockReturnValueOnce(0);
    const up = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValue({
        text: JSON.stringify({
          title: "猫咪评审饭",
          titleEn: "Cat judge rice",
          description: "猫咪来啦",
          descriptionEn: "A cat arrives",
          prompt:
            "A cat hops beside the rice and leaves a toy-like cartoon poop swirl.",
        }),
      });
    const crafts = new Crafts(db, up),
      id = randomUUID(),
      action = randomUUID();
    await crafts.create(id, "owner", ["米饭"]);
    await crafts.update(id, "owner", (s) => {
      s.opening = opening;
    });
    await expect(
      crafts.action(id, "owner", action, "cat", "animal"),
    ).rejects.toThrow("temporary outage");
    const failed = await crafts.read(id, "owner");
    expect(failed.actions[action].behavior).toBe(animalBehaviors[5]);
    expect(failed.animals).toEqual([]);
    const count = pick.mock.calls.length;
    await crafts.action(id, "owner", action, "cat", "animal");
    expect(pick.mock.calls.length).toBe(count);
    expect(up.mock.calls[1]).toEqual(up.mock.calls[0]);
    await expect(
      crafts.action(id, "owner", action, "cat", "ingredient"),
    ).rejects.toThrow("REQUEST_CONFLICT");
    await expect(
      crafts.action(id, "owner", action, "dog", "animal"),
    ).rejects.toThrow("REQUEST_CONFLICT");
    const ingredientAction = randomUUID();
    await crafts.update(id, "owner", (s) => {
      s.busyUntil = 0;
    });
    await expect(
      crafts.action(id, "owner", ingredientAction, "芝士"),
    ).rejects.toThrow("IN_PROGRESS");
    expect(up).toHaveBeenCalledTimes(2);
    await crafts.acknowledge(id, "owner", action);
    await crafts.acknowledge(id, "owner", action);
    const applied = await crafts.read(id, "owner");
    expect(applied.animals).toEqual(["cat"]);
    expect(applied.additions).toEqual([]);
    expect(applied.actionOrder).toEqual([action]);
    await crafts.action(id, "owner", ingredientAction, "芝士");
    expect(up.mock.calls.at(-1)?.[1]).toMatchObject({
      prompt: expect.stringContaining('Existing animal characters: ["cat"]'),
    });
    await crafts.acknowledge(id, "owner", ingredientAction);
    const mixed = await crafts.read(id, "owner");
    expect(mixed.animals).toEqual(["cat"]);
    expect(mixed.additions).toEqual(["芝士"]);
    expect(mixed.actionOrder).toEqual([action, ingredientAction]);
    pick.mockReset();
    pick.mockReturnValue(0);
  });
  it("rejects invalid animal ids at the HTTP endpoint without invoking the provider", async () => {
    const up = vi.fn();
    const { app } = createApp(config, db, up);
    const cookie = await auth(app),
      craftId = randomUUID(),
      liveId = randomUUID();
    await app.request("/api/crafts", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ id: craftId, ingredients: ["米饭"] }),
    });
    const owner = (
      await db.pool.query("SELECT owner FROM fw_records WHERE id=$1", [craftId])
    ).rows[0].owner;
    await db.pool.query(
      "INSERT INTO fw_live(id,owner,craft_id,request_id,upstream_id,expires_at,heartbeat_at,status,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        liveId,
        owner,
        craftId,
        "test-request",
        "provider",
        Date.now() + 60000,
        Date.now(),
        "active",
        "development",
      ],
    );
    const response = await app.request(`/api/live/${liveId}/actions`, {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({
        id: randomUUID(),
        ingredient: "invented-not-in-catalog",
        kind: "animal",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_ANIMAL" },
    });
    expect(up).not.toHaveBeenCalled();
    expect((await new Crafts(db, up).read(craftId, owner)).actions).toEqual({});
  });
  it("shares the twelve-step limit across animal and ingredient actions", async () => {
    const up = vi.fn(),
      c = new Crafts(db, up),
      id = randomUUID();
    await c.create(id, "owner", ["米饭"]);
    await c.update(id, "owner", (s) => {
      s.opening = opening;
      s.additions = Array(11).fill("芝士");
      s.animals = ["cat"];
    });
    await expect(
      c.action(id, "owner", randomUUID(), "dog", "animal"),
    ).rejects.toThrow("INGREDIENT_LIMIT");
    await expect(c.action(id, "owner", randomUUID(), "米饭")).rejects.toThrow(
      "INGREDIENT_LIMIT",
    );
    expect(up).not.toHaveBeenCalled();
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
        animals: ["cat"],
        createdAt: Date.now(),
      }),
    );
    form.append(
      "image",
      new Blob(["image-bytes"], { type: "image/png" }),
      "image.png",
    );
    form.append(
      "cover",
      new Blob(["final-frame"], { type: "image/jpeg" }),
      "cover.jpg",
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
    expect(list[0].animals).toEqual(["cat"]);
    const thumbnail = await second.request(list[0].imageUrl, {
      headers: { cookie },
    });
    expect(await thumbnail.text()).toBe("final-frame");
    const original = await second.request(`/api/creations/${id}/image`, {
      headers: { cookie },
    });
    expect(await original.text()).toBe("image-bytes");
    const r = await second.request(`/api/creations/${id}/video`, {
      headers: { cookie, range: "bytes=0-4" },
    });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("video");
    expect(
      (await second.request(`/api/creations/${id}/share`, { method: "POST" }))
        .status,
    ).toBe(401);
    const shared = await (
      await first.request(`/api/creations/${id}/share`, {
        method: "POST",
        headers: { cookie },
      })
    ).json();
    const token = new URL(shared.url, "http://localhost").searchParams.get(
      "share",
    )!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const repeat = await (
      await second.request(`/api/creations/${id}/share`, {
        method: "POST",
        headers: { cookie },
      })
    ).json();
    expect(repeat.url).toBe(shared.url);
    const publicMeta = await second.request(`/api/shared/${token}`);
    expect(publicMeta.status).toBe(200);
    expect(await publicMeta.json()).toMatchObject({
      baseIngredients: ["米饭"],
      animals: ["cat"],
    });
    const clip = await second.request(`/api/shared/${token}/video`, {
      headers: { range: "bytes=-5" },
    });
    expect(clip.status).toBe(206);
    expect(await clip.text()).toBe("bytes");
    expect((await second.request(`/api/shared/${"a".repeat(43)}`)).status).toBe(
      404,
    );
    expect((await second.request(`/api/shared/${token}/secret`)).status).toBe(
      400,
    );
    expect((await second.request("/api/creations")).status).toBe(401);
    expect(
      (await second.request(`/api/crafts/${id}/live`, { method: "POST" }))
        .status,
    ).toBe(401);
    await db.pool.query("UPDATE fw_creations SET video=NULL WHERE id=$1", [id]);
    expect(
      (
        await second.request(`/api/creations/${id}/share`, {
          method: "POST",
          headers: { cookie },
        })
      ).status,
    ).toBe(404);
    expect((await second.request(`/api/shared/${token}`)).status).toBe(404);
  });
});
