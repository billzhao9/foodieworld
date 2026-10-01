import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: vi.fn(),
  onUnmounted: vi.fn(),
}));
vi.mock("../src/i18n", async () => ({
  locale: (await import("vue")).ref("zh"),
}));
vi.mock("../src/lib/live", () => ({
  connectLive: vi.fn(),
  prepareLiveAudio: vi.fn(),
  recordingSupported: () => true,
}));
vi.mock("../src/lib/storage", () => ({
  saveCreation: vi.fn(),
  listCreations: vi.fn().mockResolvedValue([]),
  getVideo: vi.fn(),
  getImage: vi.fn(),
}));
import { useKitchen } from "../src/useKitchen";
import { connectLive } from "../src/lib/live";
import { listCreations, saveCreation } from "../src/lib/storage";
const clip = new Blob(["video"], { type: "video/mp4" });
let callbacks: Parameters<typeof connectLive>[0];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("sessionStorage", { setItem: vi.fn(), getItem: () => null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/image")) return new Response(new Blob(["image"]));
      if (url.endsWith("/narration")) return new Response(new Blob(["audio"]));
      if (url.endsWith("/prepare"))
        return Response.json({
          imageUrl: "/image",
          opening: {
            title: "披萨",
            titleEn: "Pizza",
            description: "好吃",
            descriptionEn: "Yummy",
            imagePrompt: "a tasty pizza on plate",
            videoPrompt: "pizza comes out of oven",
          },
        });
      if (url.endsWith("/live"))
        return Response.json({
          id: "live",
          expiresAt: Date.now() + 60000,
          connection: {
            protocol: "webrtc",
            apiBase: "https://example.com",
            sessionId: "session",
            jwt: "test",
            modelSlug: "test",
          },
        });
      return Response.json({});
    }),
  );
  vi.mocked(connectLive).mockImplementation(async (options) => {
    callbacks = options;
    options.onPlaying?.();
    return {
      close: vi.fn().mockResolvedValue(clip),
      update: vi.fn().mockResolvedValue(undefined),
      stopSpeech: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined),
    } as any;
  });
  vi.mocked(saveCreation).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function live() {
  const kitchen = useKitchen();
  kitchen.videoElement.value = {
    videoWidth: 0,
    muted: false,
  } as HTMLVideoElement;
  kitchen.selectIngredients(["番茄"]);
  await kitchen.start();
  expect(kitchen.stage.value).toBe("live");
  return kitchen;
}
it("automatically saves recorded video when generation completes", async () => {
  const k = await live();
  callbacks.onComplete?.();
  await k.stop();
  expect(saveCreation).toHaveBeenCalledTimes(1);
  expect(vi.mocked(saveCreation).mock.calls[0][2]).toBe(clip);
  expect(k.saved.value).toBe(true);
});
it("coalesces manual save and concurrent stop without duplicate uploads", async () => {
  const k = await live();
  await Promise.all([k.save(), k.stop(), k.save()]);
  expect(saveCreation).toHaveBeenCalledTimes(1);
});
it("keeps the recording on upload failure and retries with the same id", async () => {
  const k = await live();
  vi.mocked(saveCreation).mockRejectedValueOnce(new Error("offline"));
  await k.stop();
  expect(k.saved.value).toBe(false);
  expect(k.recordingUrl.value).toMatch(/^blob:/);
  expect(k.saveState.value).toBe("pending");
  await k.save();
  expect(k.saved.value).toBe(true);
  expect(k.error.value).toBe("");
  expect(vi.mocked(saveCreation).mock.calls[0][0].id).toBe(
    vi.mocked(saveCreation).mock.calls[1][0].id,
  );
});
it("does not automatically publish an image when no video was received", async () => {
  vi.mocked(connectLive).mockImplementationOnce(async (options) => {
    options.onPlaying?.();
    return { close: async () => null } as any;
  });
  const k = await live();
  await k.stop();
  expect(saveCreation).not.toHaveBeenCalled();
});

it("edits ingredients in place after preserving the recorded creation", async () => {
  const k = await live();
  expect(await k.editIngredients(["鸡蛋", "芝士"], "skillet")).toBe(true);
  expect(saveCreation).toHaveBeenCalledTimes(1);
  expect(k.page.value).toBe("lab");
  expect(k.selected.value?.ingredients).toEqual(["鸡蛋", "芝士"]);
  expect(k.activeCookware.value).toBe("skillet");
  expect(k.stage.value).toBe("idle");
});
it("does not discard the current recording when saving before an edit fails", async () => {
  const k = await live();
  vi.mocked(saveCreation).mockRejectedValue(new Error("offline"));
  expect(await k.editIngredients(["芝士"], "skillet")).toBe(false);
  expect(k.selected.value?.ingredients).toEqual(["番茄"]);
  expect(k.recordingUrl.value).toMatch(/^blob:/);
});

function mockActions() {
  const original = vi.mocked(fetch).getMockImplementation()!;
  const names: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).endsWith("/actions")) {
      const body = JSON.parse(String(init?.body));
      names.push(body.ingredient);
      return Response.json({
        title: body.ingredient,
        titleEn: body.ingredient,
        description: "Changed",
        descriptionEn: "Changed",
        prompt: `Add ${body.ingredient} to the scene`,
      });
    }
    return original(input, init);
  });
  return names;
}
it("queues mixed rapid clicks in order with a scene dwell between accepted changes", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  const k = await live();
  const names = mockActions();
  k.addIngredient("云端彩珠");
  k.addAnimal("turtle");
  k.addIngredient("芝士");
  await vi.advanceTimersByTimeAsync(0);
  expect(names).toEqual(["云端彩珠"]);
  expect(k.additionQueue.value.map((a) => a.status)).toEqual([
    "sent",
    "queued",
    "queued",
  ]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(names).toEqual(["云端彩珠", "turtle"]);
  await vi.advanceTimersByTimeAsync(6000);
  expect(names).toEqual(["云端彩珠", "turtle", "芝士"]);
  expect(k.animals.value).toEqual(["turtle"]);
  await k.stop();
});
it("cancels unsent additions on stop and never sends them into a later round", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  const k = await live();
  const names = mockActions();
  k.addIngredient("云端彩珠");
  k.addAnimal("turtle");
  await vi.advanceTimersByTimeAsync(0);
  await k.stop();
  await vi.advanceTimersByTimeAsync(6000);
  expect(names).toEqual(["云端彩珠"]);
  expect(k.additionQueue.value[1].status).toBe("cancelled");
});
it("supports removing a waiting action and reports queue capacity instead of silently ignoring taps", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  const k = await live();
  mockActions();
  for (let i = 0; i < 9; i++) k.addIngredient(`加料${i}`);
  expect(k.additionQueue.value).toHaveLength(8);
  expect(k.error.value).toContain("8");
  k.cancelAddition(k.additionQueue.value[1].id);
  expect(k.additionQueue.value[1].status).toBe("cancelled");
  await vi.advanceTimersByTimeAsync(0);
  await k.stop();
});


it("refreshes shared creations when entering the gallery and deduplicates requests", async () => {
  const { nextTick } = await import("vue");
  const kitchen = useKitchen();
  kitchen.authenticated.value = true;
  let resolve!: (items: any[]) => void;
  vi.mocked(listCreations).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  kitchen.tab.value = "favorites";
  await nextTick();
  expect(listCreations).toHaveBeenCalledTimes(1);
  const manual = kitchen.refreshGallery();
  expect(listCreations).toHaveBeenCalledTimes(1);
  resolve([{ id: "another-visitor", hasVideo: true }]);
  await manual;
  expect(kitchen.favorites.value[0].id).toBe("another-visitor");
  expect(kitchen.galleryLoading.value).toBe(false);
  vi.mocked(listCreations).mockRejectedValueOnce(new Error("offline"));
  await kitchen.refreshGallery();
  expect(kitchen.galleryError.value).toBe(true);
  expect(kitchen.favorites.value[0].id).toBe("another-visitor");
});


it("saves without waiting for a stalled remote stop response", async () => {
  const k = await live();
  const previous = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url: any, init?: any) =>
    String(url).endsWith('/stop') ? new Promise(() => {}) : previous(url, init));
  await k.stop();
  expect(saveCreation).toHaveBeenCalledOnce();
  expect(k.saveState.value).toBe('saved');
});
it("persists failed uploads on device and recovers them without generation", async () => {
  const { pendingCreations } = await import('../src/lib/recording-outbox');
  const k = await live();
  vi.mocked(saveCreation).mockRejectedValueOnce(new Error('offline'));
  await k.stop();
  expect(k.saveState.value).toBe('pending');
  expect((await pendingCreations())[0].video?.size).toBe(clip.size);
  const reloaded = useKitchen();
  vi.mocked(connectLive).mockClear();
  await reloaded.retrySaving(true);
  expect(await pendingCreations()).toEqual([]);
  expect(reloaded.saveState.value).toBe('saved');
  expect(connectLive).not.toHaveBeenCalled();
});
it("reports a memory-only recording when local backup and upload both fail", async () => {
  const k = await live();
  vi.stubGlobal('indexedDB', undefined);
  vi.mocked(saveCreation).mockRejectedValueOnce(new Error('offline'));
  await k.stop();
  expect(k.saveState.value).toBe('failed');
  expect(k.recordingUrl.value).toMatch(/^blob:/);
});

it('captures a connection that finishes returning after stop was requested', async () => {
  let finish!: () => void;
  let ready!: () => void;
  const playing = new Promise<void>(resolve => { ready = resolve; });
  const release = new Promise<void>(resolve => { finish = resolve; });
  const close = vi.fn().mockResolvedValue(clip);
  vi.mocked(connectLive).mockImplementationOnce(async options => {
    options.onPlaying();
    ready();
    await release;
    return { close, update: vi.fn(), stopSpeech: vi.fn() } as any;
  });
  const k = useKitchen();
  k.videoElement.value = {videoWidth: 0, muted: false} as HTMLVideoElement;
  k.selectIngredients(['番茄']);
  const started = k.start();
  await playing;
  const stopped = k.stop();
  finish();
  await Promise.all([started, stopped]);
  expect(close).toHaveBeenCalledOnce();
  expect(saveCreation).toHaveBeenCalledOnce();
  expect(k.saved.value).toBe(true);
});

it('keeps the live session running during catalogue navigation and preserves the current recipe', async () => {
  const k = await live();
  const close = (await vi.mocked(connectLive).mock.results[0].value).close;
  k.back();
  expect(k.page.value).toBe('catalog');
  expect(k.stage.value).toBe('live');
  expect(close).not.toHaveBeenCalled();
  expect(saveCreation).not.toHaveBeenCalled();
  k.selectIngredients(['米饭']);
  expect(k.page.value).toBe('lab');
  expect(k.baseIngredients.value).toEqual(['番茄']);
  await k.stop();
});
