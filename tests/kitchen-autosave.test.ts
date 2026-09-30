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
import { saveCreation } from "../src/lib/storage";
const clip = new Blob(["video"], { type: "video/mp4" });
let callbacks: Parameters<typeof connectLive>[0];
beforeEach(() => {
  vi.clearAllMocks();
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
    return { close: vi.fn().mockResolvedValue(clip) } as any;
  });
  vi.mocked(saveCreation).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
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
  expect(k.error.value).toContain("保存未完成");
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
