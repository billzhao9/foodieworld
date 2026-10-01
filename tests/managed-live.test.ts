import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Database } from "../server/db";
import { Crafts } from "../server/crafts";
import { Narrations } from "../server/narration";
import { ManagedSessions } from "../server/managed-live";
import { LiveSessions } from "../server/live";
import { MediaArchive } from "../server/media-archive";
import { ApiError } from "../server/upstream";
const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `fw_managed_${randomUUID().replaceAll("-", "")}`;
const config = {
  password: "test",
  secret: "test",
  databaseUrl: "",
  baseUrl: "https://mml.example",
  apiKey: "private",
  secure: false,
  port: 4174,
  host: "localhost",
  environment: "test",
  mediaArchive: true,
  managedLive: true,
};
const opening = {
  title: "饭",
  titleEn: "Rice",
  description: "暖饭",
  descriptionEn: "Warm rice",
  imagePrompt: "A delicious rice plate",
  videoPrompt: "Rice steams.",
  effectsPrompt: "Sizzle",
  narrationZh: "开饭了",
  narrationEn: "Rice is ready",
  audioPromptZh: "",
  audioPromptEn: "",
};
let admin: pg.Pool, db: Database;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe.skipIf(!databaseUrl)("managed live durable control", () => {
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    db = new Database(url.href);
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
      "TRUNCATE fw_managed_commands,fw_managed_sessions,fw_creation_likes,fw_creations,fw_live,fw_records,fw_narrations",
    );
  });
  async function fixture() {
    let state: Record<string, unknown> = {
      status: "running",
      recordingStatus: "capturing",
      deadline: Date.now() + 90000,
      playbackUrl: "/media/live/upstream/index.m3u8?ticket=private-viewer",
      commands: [],
    };
    const upstream = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path === "/live-sessions"
          ? {
              managed: true,
              sessionId: "upstream",
              playbackUrl: state.playbackUrl,
            }
          : path.endsWith("/stop") || path.endsWith("/commands")
            ? { ok: true }
            : state,
      );
    const crafts = new Crafts(db, upstream),
      craftId = randomUUID();
    await crafts.create(craftId, "owner", ["rice"]);
    await crafts.update(craftId, "owner", (s) => {
      s.opening = opening;
      s.phase = "ready";
      s.imageUrl = "https://mml.example/opening.png";
    });
    const archive = new MediaArchive(config);
    const save = vi
      .spyOn(archive, "save")
      .mockImplementation(async (input) => `asset-${input.kind}`);
    const publish = vi
      .spyOn(archive, "publish")
      .mockResolvedValue("https://mml.example/media/published/final");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(Buffer.from("image"), {
            headers: { "content-type": "image/png" },
          }),
        ),
    );
    const managed = new ManagedSessions(
      config,
      db,
      upstream,
      crafts,
      new Narrations(db, crafts, async () => Buffer.from("RIFFvoice")),
      archive,
    );
    return {
      managed,
      crafts,
      craftId,
      upstream,
      save,
      publish,
      setState: (value: Record<string, unknown>) => {
        state = { ...state, ...value };
      },
    };
  }
  it("survives absent browser heartbeats and saves a published final without browser upload", async () => {
    const f = await fixture(),
      session = await f.managed.start(f.craftId, "owner", "zh");
    expect(session.playbackUrl).toBe(
      `/api/live/${session.id}/stream/index.m3u8`,
    );
    expect(f.save.mock.calls.map(([input]) => input.kind)).toEqual([
      "image",
      "audio",
    ]);
    await db.pool.query("UPDATE fw_live SET heartbeat_at=0,expires_at=0");
    await new LiveSessions(db, f.upstream, f.crafts, "test").cleanup();
    expect(
      (await db.pool.query("SELECT count(*)::int count FROM fw_live")).rows[0]
        .count,
    ).toBe(1);
    f.setState({
      status: "ended",
      recordingStatus: "playable",
      assetId: "final-video",
    });
    await f.managed.cleanup();
    const row = (await db.pool.query("SELECT * FROM fw_creations")).rows[0];
    expect(row).toMatchObject({
      id: session.id,
      video_asset_id: "final-video",
      image_asset_id: "asset-image",
      video: null,
      image: null,
      video_status: "ready",
    });
    expect(f.publish).toHaveBeenCalledWith("final-video");
    expect((await f.managed.recover("owner"))?.session.creationId).toBe(
      session.id,
    );
    expect(await f.managed.recover("other")).toBeNull();
    await expect(f.managed.status(session.id, "other")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("recovers an uncertain creation with exactly the same request even if stop arrived", async () => {
    const f = await fixture();
    const normal = f.upstream.getMockImplementation()!;
    let failed = false;
    f.upstream.mockImplementation(async (path, ...args) => {
      if (path === "/live-sessions" && !failed) {
        failed = true;
        throw new ApiError("UPSTREAM_UNAVAILABLE", 503);
      }
      return normal(path, ...args);
    });
    await expect(
      f.managed.start(f.craftId, "owner", "en"),
    ).rejects.toMatchObject({ status: 503 });
    const row = (await db.pool.query("SELECT * FROM fw_managed_sessions"))
      .rows[0];
    await f.managed.stop(row.id, "owner");
    await f.managed.status(row.id, "owner");
    const creates = f.upstream.mock.calls.filter(
      ([path]) => path === "/live-sessions",
    );
    expect(creates).toHaveLength(2);
    expect(creates[1][1]).toEqual(creates[0][1]);
    expect(f.upstream).toHaveBeenCalledWith(
      "/managed-live-sessions/upstream/stop",
      {},
    );
  });
  it("recovers a persisted addition and only applies it after the managed acknowledgement", async () => {
    const f = await fixture(),
      session = await f.managed.start(f.craftId, "owner", "zh");
    await f.crafts.update(f.craftId, "owner", (s) => {
      s.busy = "add";
      s.actionOrder = ["add"];
      s.actions.add = {
        ingredient: "pepper",
        kind: "ingredient",
        state: "ready",
        result: { ...opening, prompt: "Pepper falls onto the rice." },
      };
    });
    await f.managed.status(session.id, "owner");
    expect(f.upstream).toHaveBeenCalledWith(
      "/managed-live-sessions/upstream/commands",
      {
        commandId: "add",
        prompt: "Pepper falls onto the rice.",
        narrationAssetId: "asset-audio",
      },
    );
    expect((await f.crafts.read(f.craftId, "owner")).additions).toEqual([]);
    f.setState({
      commands: [{ commandId: "add", sequence: 1, status: "ack" }],
    });
    await f.managed.status(session.id, "owner");
    await f.managed.status(session.id, "owner");
    expect((await f.crafts.read(f.craftId, "owner")).additions).toEqual([
      "pepper",
    ]);
  });
  it("proxies HLS fragments on the owned origin without exposing the viewer ticket", async () => {
    const f = await fixture(),
      session = await f.managed.start(f.craftId, "owner", "zh");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '#EXTM3U\n#EXT-X-MAP:URI="0.m4s?ticket=secret"\n1.m4s?ticket=secret\n',
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const response = await f.managed.stream(
      session.id,
      "owner",
      "index.m3u8",
      new Request("https://food.test/stream"),
    );
    expect(await response.text()).toBe(
      '#EXTM3U\n#EXT-X-MAP:URI="0.m4s"\n1.m4s\n',
    );
    await expect(
      f.managed.stream(
        session.id,
        "other",
        "index.m3u8",
        new Request("https://food.test/stream"),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.managed.stream(
        session.id,
        "owner",
        "../other",
        new Request("https://food.test/stream"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
