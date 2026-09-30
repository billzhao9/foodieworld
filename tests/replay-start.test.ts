import { expect, it, vi } from "vitest";
import { beginReplay } from "../src/lib/replay-start";
class Video extends EventTarget {
  src = "";
  preload = "";
  paused = true;
  ended = false;
  currentTime = 0;
  getAttribute() {
    return this.src;
  }
  removeAttribute() {
    this.src = "";
  }
  load = vi.fn();
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(() => this.dispatchEvent(new Event("pause")));
}
it("loads and plays synchronously from the opening gesture, then retries readiness once", () => {
  const v = new Video();
  const report = vi.fn();
  const dispose = beginReplay(
    v as unknown as HTMLVideoElement,
    "/clip",
    report,
  );
  expect(v.load).toHaveBeenCalledOnce();
  expect(v.play).toHaveBeenCalledOnce();
  v.dispatchEvent(new Event("canplay"));
  v.dispatchEvent(new Event("canplay"));
  expect(v.play).toHaveBeenCalledTimes(2);
  v.dispatchEvent(new Event("playing"));
  expect(report).toHaveBeenLastCalledWith("playing");
  dispose();
  v.dispatchEvent(new Event("canplay"));
  expect(v.play).toHaveBeenCalledTimes(2);
});
it("never resumes after the user pauses or closes", () => {
  const v = new Video();
  const dispose = beginReplay(
    v as unknown as HTMLVideoElement,
    "/clip",
    vi.fn(),
  );
  v.dispatchEvent(new Event("pause"));
  v.dispatchEvent(new Event("canplay"));
  expect(v.play).toHaveBeenCalledOnce();
  dispose();
});
it("exposes browser playback permission rejection instead of silently swallowing it", async () => {
  const v = new Video();
  const report = vi.fn();
  v.play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
  const dispose = beginReplay(
    v as unknown as HTMLVideoElement,
    "/clip",
    report,
  );
  await Promise.resolve();
  expect(report).toHaveBeenLastCalledWith("blocked");
  dispose();
});
