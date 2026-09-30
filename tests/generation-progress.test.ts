import { describe, it, expect, vi } from "vitest";
import {
  GenerationProgressTracker,
  GENERATION_HISTORY_KEY,
  loadGenerationHistory,
  formatGenerationRange,
  type ProgressStorage,
} from "../src/lib/generation-progress";
function storage(initial?: unknown) {
  const values = new Map<string, string>([["unrelated-preference", "keep-me"]]);
  if (initial !== undefined)
    values.set(
      GENERATION_HISTORY_KEY,
      typeof initial === "string" ? initial : JSON.stringify(initial),
    );
  const result: ProgressStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key, value) => {
      values.set(key, value);
    }),
  };
  return { result, values };
}
function complete(tracker: GenerationProgressTracker, offset = 0) {
  tracker.transition("planning", offset);
  tracker.transition("imaging", offset + 10_000);
  tracker.transition("connecting", offset + 60_000);
  return tracker.transition("live", offset + 90_000);
}
describe("honest generation estimates", () => {
  it("starts with a one-to-two-minute range, advances stages and only completes on live", () => {
    const tracker = new GenerationProgressTracker();
    const start = tracker.transition("planning", 0);
    expect(start.remainingSeconds).toEqual({ low: 60, high: 120 });
    expect(start.progress).toBe(0);
    expect(start.hasHistory).toBe(false);
    expect(tracker.snapshot(10_000).elapsedSeconds).toBe(10);
    const image = tracker.transition("imaging", 10_000);
    expect(image.progress).toBe(18);
    const connect = tracker.transition("connecting", 60_000);
    expect(connect.progress).toBe(76);
    expect(tracker.snapshot(75_000).progress).toBeLessThan(96);
    const done = tracker.transition("live", 90_000);
    expect(done.progress).toBe(100);
    expect(done.active).toBe(false);
    expect(done.elapsedSeconds).toBe(90);
    expect(tracker.snapshot(200_000).elapsedSeconds).toBe(90);
  });
  it.each(["error", "stopped", "idle"])(
    "freezes timing and never records a %s run",
    (state) => {
      const { result } = storage();
      const tracker = new GenerationProgressTracker(result);
      tracker.transition("planning", 0);
      tracker.transition("imaging", 12_000);
      const stopped = tracker.transition(state, 30_000),
        later = tracker.snapshot(300_000);
      expect(later.elapsedSeconds).toBe(30);
      expect(later.progress).toBe(stopped.progress);
      expect(later.progress).toBeLessThan(100);
      expect(later.active).toBe(false);
      expect(result.setItem).not.toHaveBeenCalled();
    },
  );
  it("records a full success exactly once without touching other storage", () => {
    const { result, values } = storage();
    const tracker = new GenerationProgressTracker(result);
    complete(tracker);
    tracker.transition("live", 95_000);
    expect(result.setItem).toHaveBeenCalledTimes(1);
    expect(loadGenerationHistory(result).stages).toEqual({
      planning: [10_000],
      imaging: [50_000],
      connecting: [30_000],
    });
    expect(values.get("unrelated-preference")).toBe("keep-me");
  });
  it("does not mistake cached planning/image stages for fast generation samples", () => {
    const { result } = storage();
    const tracker = new GenerationProgressTracker(result);
    tracker.transition("planning", 0);
    tracker.transition("imaging", 20);
    tracker.transition("connecting", 120);
    tracker.transition("live", 20_120);
    expect(loadGenerationHistory(result).stages).toEqual({
      planning: [],
      imaging: [],
      connecting: [20_000],
    });
  });
  it("does not sample incomplete observations that begin mid-run or skip stages", () => {
    const { result } = storage();
    const tracker = new GenerationProgressTracker(result);
    tracker.transition("imaging", 0);
    tracker.transition("connecting", 50_000);
    tracker.transition("live", 70_000);
    tracker.transition("planning", 80_000);
    tracker.transition("connecting", 90_000);
    tracker.transition("live", 100_000);
    expect(result.setItem).not.toHaveBeenCalled();
  });
  it("retains only the seven most recent successful samples for each stage", () => {
    const prior = {
      version: 1,
      stages: {
        planning: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000],
        imaging: [],
        connecting: [],
      },
    };
    const { result } = storage(prior);
    const tracker = new GenerationProgressTracker(result);
    complete(tracker);
    expect(loadGenerationHistory(result).stages.planning).toEqual([
      3000, 4000, 5000, 6000, 7000, 8000, 10_000,
    ]);
  });
  it("uses the median rather than the mean for soft progress while retaining an uncertainty range", () => {
    const { result } = storage({
      version: 1,
      stages: {
        planning: [10_000, 20_000, 90_000],
        imaging: [],
        connecting: [],
      },
    });
    const tracker = new GenerationProgressTracker(result);
    tracker.transition("planning", 0);
    const state = tracker.snapshot(10_000);
    expect(state.progress).toBe(9);
    expect(state.hasHistory).toBe(true);
    expect(state.remainingSeconds.high).toBeGreaterThan(
      state.remainingSeconds.low,
    );
  });
  it("marks overdue work and never returns a negative countdown or fictitious completion", () => {
    const tracker = new GenerationProgressTracker();
    tracker.transition("planning", 0);
    const planning = tracker.snapshot(25_000);
    expect(planning.overdue).toBe(true);
    expect(planning.progress).toBeLessThan(18);
    tracker.transition("imaging", 30_000);
    tracker.transition("connecting", 100_000);
    const veryLate = tracker.snapshot(3_600_000);
    expect(veryLate.overdue).toBe(true);
    expect(veryLate.remainingSeconds).toEqual({ low: 0, high: 0 });
    expect(veryLate.progress).toBeLessThan(96);
    expect(veryLate.elapsedSeconds).toBe(3600);
  });
  it("keeps estimated progress monotonic across phases and clock reads", () => {
    const tracker = new GenerationProgressTracker();
    const percentages: number[] = [];
    percentages.push(tracker.transition("planning", 0).progress);
    for (const now of [1000, 5000, 20_000])
      percentages.push(tracker.snapshot(now).progress);
    percentages.push(tracker.transition("imaging", 30_000).progress);
    for (const now of [31_000, 60_000, 55_000, 120_000])
      percentages.push(tracker.snapshot(now).progress);
    percentages.push(tracker.transition("connecting", 130_000).progress);
    for (const now of [131_000, 180_000, 500_000])
      percentages.push(tracker.snapshot(now).progress);
    percentages.push(tracker.transition("live", 510_000).progress);
    expect(percentages).toEqual([...percentages].sort((a, b) => a - b));
    expect(percentages.at(-1)).toBe(100);
  });
  it.each([
    "not json",
    { version: 0, stages: { planning: [1000] } },
    { version: 1, stages: null },
  ])("ignores legacy or malformed storage", (value) => {
    const { result } = storage(value);
    expect(loadGenerationHistory(result).stages).toEqual({
      planning: [],
      imaging: [],
      connecting: [],
    });
    expect(
      new GenerationProgressTracker(result).transition("planning", 0)
        .remainingSeconds,
    ).toEqual({ low: 60, high: 120 });
  });
  it("filters corrupt samples and tolerates denied storage", () => {
    const { result } = storage({
      version: 1,
      stages: {
        planning: ["bad", -1, 0, 20, 2000, 9_000_000],
        imaging: [200, 4000],
        connecting: "invalid",
      },
    });
    expect(loadGenerationHistory(result).stages).toEqual({
      planning: [2000],
      imaging: [4000],
      connecting: [],
    });
    const denied = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => complete(new GenerationProgressTracker(denied))).not.toThrow();
  });
});

describe("estimated range labels", () => {
  it("preserves sub-minute endpoints instead of inflating them to full minutes", () => {
    expect(formatGenerationRange(5, 65, "zh")).toBe("5秒–1分5秒");
    expect(formatGenerationRange(5, 65, "en")).toBe("5s–1m 5s");
    expect(formatGenerationRange(60, 120, "zh")).toBe("1–2分钟");
    expect(formatGenerationRange(60, 120, "en")).toBe("1–2 min");
    expect(formatGenerationRange(0, 10, "zh")).toBe("0秒–10秒");
  });
});
