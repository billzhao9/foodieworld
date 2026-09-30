import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const run = promisify(execFile);
export function fragmentedMp4(data: Buffer): boolean {
  if (data.length < 8 || data.toString("ascii", 4, 8) !== "ftyp") return false;
  for (let offset = 0; offset + 8 <= data.length; ) {
    let size = data.readUInt32BE(offset);
    const kind = data.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > data.length) return false;
      const large = data.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(large);
      header = 16;
    }
    if (size === 0) size = data.length - offset;
    if (size < header || offset + size > data.length) return false;
    if (kind === "moof") return true;
    offset += size;
  }
  return false;
}
export async function finalizeRecording(
  data: Buffer,
  type: string,
): Promise<Buffer> {
  if (type.split(";")[0]?.trim() !== "video/mp4" || !fragmentedMp4(data))
    return data;
  const backupDirectory = join(process.cwd(), ".data", "recording-originals");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const backup = join(
    backupDirectory,
    createHash("sha256").update(data).digest("hex") + ".mp4",
  );
  await writeFile(backup, data, { mode: 0o600, flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  const directory = await mkdtemp(join(tmpdir(), "foodieworld-replay-"));
  try {
    const input = join(directory, "input.mp4"),
      output = join(directory, "output.mp4");
    await writeFile(input, data, { mode: 0o600 });
    // Normalize browser-dependent timing/codec output for mobile playback.
    // Keep the original privately; do not regenerate any AI scene.
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "main",
        "-level:v",
        "3.1",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 90000, maxBuffer: 128 * 1024 },
    );
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
