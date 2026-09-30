import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "./db";
import type { Crafts } from "./crafts";
import { ApiError } from "./upstream";
const run = promisify(execFile);
export type NarrationLanguage = "zh" | "en";
export type NarrationSynthesizer = (
  text: string,
  language: NarrationLanguage,
) => Promise<Buffer>;

export function narrationText(
  value: { narrationZh?: string; narrationEn?: string },
  language: NarrationLanguage,
): string {
  const candidate = language === "zh" ? value.narrationZh : value.narrationEn;
  const languageMatches =
    candidate &&
    (language === "zh"
      ? /[\p{Script=Han}]/u.test(candidate)
      : !/[\p{Script=Han}]/u.test(candidate));
  const source = languageMatches ? candidate : undefined;
  // Previously purchased receipts need no new LLM call to get a real voice.
  const fallback =
    language === "zh"
      ? "这锅主打一个胆子大，味道全靠猜！评委先别跑，还没到最离谱的呢。"
      : "One pan, absolutely no common sense! Judges, stay seated. The chaos is just getting started.";
  return (source?.trim() || fallback)
    .replace(/\[\[[\s\S]*?\]\]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}
export const synthesizeLocalNarration: NarrationSynthesizer = async (
  text,
  language,
) => {
  if (process.platform !== "darwin")
    throw new ApiError("NARRATION_UNAVAILABLE", 503);
  const directory = await mkdtemp(join(tmpdir(), "foodieworld-voice-"));
  try {
    const input = join(directory, "line.txt"),
      output = join(directory, "line.wav");
    await writeFile(input, text, { mode: 0o600 });
    await run(
      "/usr/bin/say",
      [
        "-v",
        language === "zh" ? "Tingting" : "Samantha",
        "-r",
        language === "zh" ? "190" : "185",
        "-f",
        input,
        "-o",
        output,
        "--file-format=WAVE",
        "--data-format=LEI16@24000",
      ],
      { timeout: 20000, maxBuffer: 64 * 1024 },
    );
    const audio = await readFile(output);
    if (
      audio.length < 44 ||
      audio.toString("ascii", 0, 4) !== "RIFF" ||
      audio.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new Error("Invalid narration audio");
    return audio;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("NARRATION_UNAVAILABLE", 503);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
export class Narrations {
  private pending = new Map<string, Promise<Buffer>>();
  constructor(
    private db: Database,
    private crafts: Crafts,
    private synthesize: NarrationSynthesizer = synthesizeLocalNarration,
  ) {}
  async get(
    craftId: string,
    owner: string,
    language: NarrationLanguage,
    actionId?: string,
  ): Promise<Buffer> {
    const craft = await this.crafts.read(craftId, owner);
    const entry = actionId ? craft.actions[actionId]?.result : craft.opening;
    if (!entry) throw new ApiError("NOT_READY", 409);
    const text = narrationText(entry, language);
    const key = createHash("sha256")
      .update(`macos-v1:${language}:${text}`)
      .digest("hex");
    const saved = await this.db.pool.query(
      "SELECT audio FROM fw_narrations WHERE id=$1",
      [key],
    );
    if (saved.rows[0]) return saved.rows[0].audio as Buffer;
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 2) throw new ApiError("NARRATION_BUSY", 429);
    const task = (async () => {
      const audio = await this.synthesize(text, language);
      await this.db.pool.query(
        "INSERT INTO fw_narrations(id,audio) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [key, audio],
      );
      return audio;
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
}
