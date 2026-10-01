import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectManagedLive } from "../src/lib/managed-live";
class FakeVideo extends EventTarget {
  src = "";
  srcObject: unknown = null;
  muted = false;
  paused = true;
  ended = false;
  controls = true;
  currentTime = 0;
  duration = 16.02;
  seekable = { length: 0, start: () => 0, end: () => 0 };
  canPlayType() {
    return "probably";
  }
  play = vi.fn(async () => {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("play"));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  load = vi.fn(() => {
    const wasPlaying = !this.paused;
    this.currentTime = 0;
    this.ended = false;
    this.paused = true;
    if (wasPlaying) this.dispatchEvent(new Event("pause"));
  });
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  metadata(duration = this.duration) {
    this.duration = duration;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
  finish() {
    this.currentTime = this.duration;
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
    this.dispatchEvent(new Event("ended"));
  }
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function fixture() {
  const video = new FakeVideo(),
    onError = vi.fn();
  const player = await connectManagedLive({
    video: video as unknown as HTMLVideoElement,
    url: "/api/live/id/stream/index.m3u8",
    muted: true,
    onPlaying: vi.fn(),
    onAudioBlocked: vi.fn(),
    onError,
  });
  await Promise.resolve();
  video.play.mockClear();
  video.metadata();
  await Promise.resolve();
  return { video, player, onError };
}
it("waits at a finite Safari snapshot boundary and resumes the growing manifest at the watched timestamp", async () => {
  const { video, player } = await fixture();
  video.finish();
  await vi.advanceTimersByTimeAsync(2000);
  expect(video.load).toHaveBeenCalledTimes(1);
  video.metadata(16.02);
  await vi.advanceTimersByTimeAsync(2000);
  expect(video.play).toHaveBeenCalledTimes(1);
  expect(video.load).toHaveBeenCalledTimes(2);
  video.metadata(64);
  await Promise.resolve();
  expect(video.currentTime).toBe(16.02);
  expect(video.play).toHaveBeenCalledTimes(2);
  await player.close();
});
it("does not resume or reload after a user pause, and user playback can continue normally", async () => {
  const { video, player } = await fixture();
  video.currentTime = 7;
  video.pause();
  video.dispatchEvent(new Event("error"));
  video.metadata(64);
  await vi.advanceTimersByTimeAsync(6000);
  expect(video.load).not.toHaveBeenCalled();
  expect(video.play).toHaveBeenCalledTimes(1);
  await video.play();
  video.finish();
  await vi.advanceTimersByTimeAsync(2000);
  expect(video.load).toHaveBeenCalledTimes(1);
  await player.close();
});
it("deduplicates and bounds retries, then removes all native callbacks on close", async () => {
  const { video, player, onError } = await fixture();
  video.finish();
  video.dispatchEvent(new Event("error"));
  await vi.advanceTimersByTimeAsync(2000);
  expect(video.load).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 59; i++) {
    video.metadata(16.02);
    await vi.advanceTimersByTimeAsync(2000);
  }
  video.metadata(16.02);
  expect(video.load).toHaveBeenCalledTimes(60);
  expect(onError).toHaveBeenCalledTimes(1);
  await player.close();
  const loads = video.load.mock.calls.length,
    plays = video.play.mock.calls.length;
  for (const event of ["error", "ended", "loadedmetadata", "pause", "play"])
    video.dispatchEvent(new Event(event));
  await vi.advanceTimersByTimeAsync(10000);
  expect(video.load).toHaveBeenCalledTimes(loads);
  expect(video.play).toHaveBeenCalledTimes(plays);
});
it("cancels a pending end-of-snapshot reload when the viewer closes", async () => {
  const { video, player } = await fixture();
  video.finish();
  await player.close();
  const loads = video.load.mock.calls.length;
  await vi.advanceTimersByTimeAsync(2500);
  expect(video.load).toHaveBeenCalledTimes(loads);
});
it("recovers a stalled snapshot without an ended event", async () => {
  const { video, player } = await fixture();
  video.currentTime = 12;
  video.dispatchEvent(new Event("timeupdate"));
  video.dispatchEvent(new Event("waiting"));
  await vi.advanceTimersByTimeAsync(8000);
  expect(video.load).toHaveBeenCalledTimes(1);
  video.metadata(40);
  await Promise.resolve();
  expect(video.currentTime).toBe(12);
  await player.close();
});
it("ignores a delayed internal pause while refreshing a manifest", async () => {
  const { video, player } = await fixture();
  video.currentTime = 12;
  video.dispatchEvent(new Event("error"));
  await vi.advanceTimersByTimeAsync(2000);
  video.metadata(40);
  video.dispatchEvent(new Event("pause"));
  video.dispatchEvent(new Event("error"));
  await vi.advanceTimersByTimeAsync(2000);
  expect(video.load).toHaveBeenCalledTimes(2);
  await player.close();
});
it("uses the user-unlocked audio context for Chinese narration and owns cleanup", async () => {
  const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), buffer: null };
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const context = { state: "running", destination: {}, createGain: () => gain,
    createBufferSource: () => source, decodeAudioData: vi.fn(async () => ({})), close: vi.fn(async () => {}) };
  const video = new FakeVideo();
  const player = await connectManagedLive({ video: video as unknown as HTMLVideoElement,
    url: "/stream", muted: false, audioContext: context as unknown as AudioContext,
    onPlaying: vi.fn(), onAudioBlocked: vi.fn(), onError: vi.fn() });
  await player.speak(new ArrayBuffer(8));
  expect(source.start).toHaveBeenCalledOnce();
  player.setMuted(true); expect(gain.gain.value).toBe(0);
  await player.close(); expect(context.close).toHaveBeenCalledOnce();
});

it("does not mislabel an initial unavailable playlist as an audio permission denial", async () => {
  const video = new FakeVideo(), onAudioBlocked = vi.fn();
  video.play.mockRejectedValueOnce(Object.assign(new Error("Not ready"), { name: "NotSupportedError" }));
  const player = await connectManagedLive({ video: video as unknown as HTMLVideoElement,
    url: "/stream", muted: false, onPlaying: vi.fn(), onAudioBlocked, onError: vi.fn() });
  await Promise.resolve();
  expect(onAudioBlocked).not.toHaveBeenCalled();
  video.metadata();
  await Promise.resolve();
  expect(video.paused).toBe(false);
  await player.close();
});

it("recovers when repeated timeupdate events report a frozen playhead", async () => {
  const { video, player } = await fixture();
  video.controls = false;
  video.currentTime = 12;
  video.dispatchEvent(new Event("timeupdate"));
  video.dispatchEvent(new Event("waiting"));
  for (let i = 0; i < 9; i++) {
    await vi.advanceTimersByTimeAsync(1000);
    video.dispatchEvent(new Event("timeupdate"));
  }
  expect(video.load).toHaveBeenCalled();
  video.metadata(40);
  await Promise.resolve();
  expect(video.currentTime).toBe(12);
  expect(video.paused).toBe(false);
  await player.close();
});
it("recovers a silent system pause when live playback has no pause controls", async () => {
  const { video, player } = await fixture();
  video.controls = false;
  video.currentTime = 9;
  video.dispatchEvent(new Event("timeupdate"));
  video.pause();
  await vi.advanceTimersByTimeAsync(10000);
  expect(video.load).toHaveBeenCalled();
  video.metadata(40);
  await Promise.resolve();
  expect(video.currentTime).toBe(9);
  expect(video.paused).toBe(false);
  await player.close();
});

it("catches up a delayed live viewer within the available range without changing controlled playback", async () => {
  const { video, player } = await fixture();
  video.currentTime = 3;
  video.seekable = { length: 1, start: () => 2, end: () => 24 };
  await vi.advanceTimersByTimeAsync(1000);
  expect(video.currentTime).toBe(3);
  video.controls = false;
  await vi.advanceTimersByTimeAsync(1000);
  expect(video.currentTime).toBe(22);
  await player.close();
});
