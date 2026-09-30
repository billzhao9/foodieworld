export const GENERATION_HISTORY_KEY = "foodieworld:generation-estimates:v1";
export const generationStages = ["planning", "imaging", "connecting"] as const;
export type GenerationStage = (typeof generationStages)[number];
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface StageHistory {
  version: 1;
  stages: Record<GenerationStage, number[]>;
}
interface Estimate {
  typical: number;
  low: number;
  high: number;
}
export interface GenerationSnapshot {
  stage: string;
  active: boolean;
  progress: number;
  elapsedSeconds: number;
  remainingSeconds: { low: number; high: number };
  overdue: boolean;
  hasHistory: boolean;
}
const defaults: Record<GenerationStage, Estimate> = {
  planning: { typical: 15_000, low: 10_000, high: 20_000 },
  imaging: { typical: 50_000, low: 30_000, high: 65_000 },
  connecting: { typical: 25_000, low: 20_000, high: 35_000 },
};
// These are estimated stage segments, not provider-reported percentages.
const segments: Record<GenerationStage, [number, number]> = {
  planning: [0, 18],
  imaging: [18, 76],
  connecting: [76, 96],
};
const minimumSample: Record<GenerationStage, number> = {
  planning: 1_000,
  imaging: 3_000,
  connecting: 1_000,
};
const emptyHistory = (): StageHistory => ({
  version: 1,
  stages: { planning: [], imaging: [], connecting: [] },
});
export const isGenerationStage = (stage: string): stage is GenerationStage =>
  (generationStages as readonly string[]).includes(stage);
export function loadGenerationHistory(storage?: ProgressStorage): StageHistory {
  try {
    const raw: unknown = JSON.parse(
      storage?.getItem(GENERATION_HISTORY_KEY) || "null",
    );
    if (
      !raw ||
      typeof raw !== "object" ||
      !("version" in raw) ||
      raw.version !== 1 ||
      !("stages" in raw) ||
      !raw.stages ||
      typeof raw.stages !== "object"
    )
      return emptyHistory();
    const result = emptyHistory();
    for (const stage of generationStages) {
      const values = (raw.stages as Record<string, unknown>)[stage];
      if (Array.isArray(values))
        result.stages[stage] = values
          .filter(
            (value): value is number =>
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= minimumSample[stage] &&
              value <= 3_600_000,
          )
          .slice(-7);
    }
    return result;
  } catch {
    return emptyHistory();
  }
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function estimate(stage: GenerationStage, history: StageHistory): Estimate {
  const values = history.stages[stage];
  if (!values.length) return { ...defaults[stage] };
  const typical = median(values);
  const sorted = [...values].sort((a, b) => a - b);
  const lower = sorted[Math.floor((sorted.length - 1) * 0.25)]!;
  const upper = sorted[Math.ceil((sorted.length - 1) * 0.75)]!;
  return {
    typical: Math.max(1_000, typical),
    low: Math.max(1_000, Math.min(typical * 0.75, lower * 0.8)),
    high: Math.max(typical * 1.25, upper * 1.2, typical + 5_000),
  };
}

/** Clock and storage are supplied by the UI; no network or generation side effects. */
export class GenerationProgressTracker {
  private history: StageHistory;
  private estimates: Record<GenerationStage, Estimate>;
  private stage = "idle";
  private startedAt = 0;
  private phaseStartedAt = 0;
  private frozenAt = 0;
  private lastProgress = 0;
  private currentRun = false;
  private eligible = false;
  private durations: Partial<Record<GenerationStage, number>> = {};

  constructor(private storage?: ProgressStorage) {
    this.history = loadGenerationHistory(storage);
    this.estimates = this.makeEstimates();
  }
  private makeEstimates() {
    return Object.fromEntries(
      generationStages.map((stage) => [stage, estimate(stage, this.history)]),
    ) as Record<GenerationStage, Estimate>;
  }
  private begin(stage: GenerationStage, now: number) {
    this.currentRun = true;
    this.eligible = stage === "planning";
    this.startedAt = this.phaseStartedAt = this.frozenAt = now;
    this.durations = {};
    this.lastProgress = segments[stage][0];
    this.estimates = this.makeEstimates();
  }
  transition(next: string, now: number): GenerationSnapshot {
    const previous = this.stage;
    if (next === previous) return this.snapshot(now);
    if (isGenerationStage(next)) {
      if (
        !isGenerationStage(previous) ||
        generationStages.indexOf(next) <= generationStages.indexOf(previous)
      ) {
        this.begin(next, now);
      } else {
        this.durations[previous] = Math.max(0, now - this.phaseStartedAt);
        if (
          generationStages.indexOf(next) !==
          generationStages.indexOf(previous) + 1
        )
          this.eligible = false;
        this.phaseStartedAt = now;
        this.lastProgress = Math.max(this.lastProgress, segments[next][0]);
      }
    } else if (isGenerationStage(previous)) {
      this.snapshot(now);
      this.frozenAt = Math.max(this.startedAt, now);
      this.durations[previous] = Math.max(0, now - this.phaseStartedAt);
      if (next === "live") {
        this.lastProgress = 100;
        if (
          this.eligible &&
          previous === "connecting" &&
          generationStages.every((stage) => this.durations[stage] !== undefined)
        )
          this.recordSuccess();
      }
      this.eligible = false;
    } else if (next === "live") {
      // A restored live view is complete, but has no measurable run to sample.
      this.lastProgress = 100;
    }
    this.stage = next;
    return this.snapshot(now);
  }
  private recordSuccess() {
    for (const stage of generationStages) {
      const duration = this.durations[stage]!;
      if (duration >= minimumSample[stage] && duration <= 3_600_000)
        this.history.stages[stage] = [
          ...this.history.stages[stage],
          duration,
        ].slice(-7);
    }
    try {
      this.storage?.setItem(
        GENERATION_HISTORY_KEY,
        JSON.stringify(this.history),
      );
    } catch {
      /* Private browsing or full storage must not block cooking. */
    }
  }
  snapshot(now: number): GenerationSnapshot {
    const active = isGenerationStage(this.stage);
    const currentTime = active ? Math.max(now, this.startedAt) : this.frozenAt;
    const elapsed = this.currentRun
      ? Math.max(0, currentTime - this.startedAt)
      : 0;
    let overdue = false,
      low = 0,
      high = 0;
    if (active) {
      const stage = this.stage as GenerationStage;
      const stageElapsed = Math.max(0, now - this.phaseStartedAt);
      const prediction = this.estimates[stage];
      const [from, to] = segments[stage];
      const fraction = stageElapsed / (stageElapsed + prediction.typical * 0.5);
      this.lastProgress = Math.max(
        this.lastProgress,
        Math.min(to, from + (to - from) * fraction),
      );
      const remaining = generationStages.slice(
        generationStages.indexOf(stage) + 1,
      );
      low =
        Math.max(0, prediction.low - stageElapsed) +
        remaining.reduce((sum, item) => sum + this.estimates[item].low, 0);
      high =
        Math.max(0, prediction.high - stageElapsed) +
        remaining.reduce((sum, item) => sum + this.estimates[item].high, 0);
      const totalHigh = generationStages.reduce(
        (sum, item) => sum + this.estimates[item].high,
        0,
      );
      overdue = stageElapsed >= prediction.high || elapsed >= totalHigh;
    }
    return {
      stage: this.stage,
      active,
      progress: this.lastProgress,
      elapsedSeconds: Math.floor(elapsed / 1_000),
      remainingSeconds: {
        low: Math.max(0, Math.floor(low / 1_000)),
        high: Math.max(0, Math.ceil(high / 1_000)),
      },
      overdue,
      hasHistory: generationStages.some(
        (stage) => this.history.stages[stage].length > 0,
      ),
    };
  }
}

export function formatGenerationRange(
  lowSeconds: number,
  highSeconds: number,
  locale: "zh" | "en",
): string {
  const low = Math.max(0, Math.floor(lowSeconds / 5) * 5);
  const high = Math.max(low, Math.ceil(highSeconds / 5) * 5);
  if (low >= 60 && low % 60 === 0 && high % 60 === 0) {
    const range = low === high ? `${low / 60}` : `${low / 60}–${high / 60}`;
    return `${range}${locale === "zh" ? "分钟" : " min"}`;
  }
  function endpoint(seconds: number) {
    const minutes = Math.floor(seconds / 60),
      rest = seconds % 60;
    if (!minutes) return `${rest}${locale === "zh" ? "秒" : "s"}`;
    return locale === "zh"
      ? `${minutes}分${rest ? `${rest}秒` : ""}`
      : `${minutes}m${rest ? ` ${rest}s` : ""}`;
  }
  return low === high ? endpoint(low) : `${endpoint(low)}–${endpoint(high)}`;
}
