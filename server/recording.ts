import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from "node:fs/promises";
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
interface VideoInfo { streams: {codec_type: string; codec_name: string; pix_fmt?: string; start_time?: string; profile?: string; level?: number; width?: number; height?: number; sample_rate?: string; channels?: number}[]; format: {start_time?: string; duration?: string} }
async function inspectVideo(path: string): Promise<VideoInfo> {
  const result = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration,start_time:stream=codec_type,codec_name,pix_fmt,start_time,profile,level,width,height,sample_rate,channels", "-of", "json", path], {timeout: 10000, maxBuffer: 128 * 1024});
  return JSON.parse(result.stdout);
}
function copyCompatible(info: VideoInfo): boolean {
  const video = info.streams.find(s => s.codec_type === "video");
  const audio = info.streams.filter(s => s.codec_type === "audio");
  return video?.codec_name === "h264" && video.pix_fmt === "yuv420p" && ["Constrained Baseline", "Baseline", "Main", "High"].includes(video.profile || "") && (video.level || 999) <= 41 && (video.width || 9999) <= 1920 && (video.height || 9999) <= 1080 && Number(video.start_time) >= 0 && Number(video.start_time) < 0.15 && audio.every(s => s.codec_name === "aac" && ["44100", "48000"].includes(s.sample_rate || "") && (s.channels || 99) <= 2 && Number(s.start_time) >= 0 && Number(s.start_time) < 0.15) && Number(info.format.duration) > 0;
}
export async function finalizeRecording(
  data: Buffer,
  type: string,
  forceMp4 = false,
): Promise<Buffer> {
  if (!forceMp4 && (type.split(";")[0]?.trim() !== "video/mp4" || !fragmentedMp4(data)))
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
    // Safari already records H.264/AAC. Repackage it losslessly when its timeline is sound.
    // The slower encode remains a fallback for incompatible codecs or timing.
    try {
      const source = await inspectVideo(input);
      if (copyCompatible(source)) {
        await run("ffmpeg", ["-nostdin", "-v", "error", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", output], {timeout: 20000, maxBuffer: 128 * 1024});
        const result = await inspectVideo(output);
        const first = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1", "-show_entries", "packet=pts_time,flags", "-of", "json", output], {timeout: 10000, maxBuffer: 128 * 1024});
        const packet = JSON.parse(first.stdout).packets?.[0];
        if (copyCompatible(result) && Math.abs(Number(result.format.duration) - Number(source.format.duration)) < 0.25 && packet?.flags?.includes("K") && Number(packet.pts_time) >= 0 && Number(packet.pts_time) < 0.15) {
          const copied = await readFile(output);
          if (!fragmentedMp4(copied) && copied.indexOf(Buffer.from("moov")) > 0 && copied.indexOf(Buffer.from("moov")) < copied.indexOf(Buffer.from("mdat"))) return copied;
        }
      }
    } catch { /* Retain the original and use the established compatibility encode. */ }
    await rm(output, {force: true});
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


const exportsInProgress = new Map<string, Promise<Buffer>>();
export async function exportMp4(data: Buffer, type: string): Promise<Buffer> {
  if (type.split(';')[0]?.trim() === 'video/mp4') return finalizeRecording(data, type);
  const hash = createHash('sha256').update(data).digest('hex');
  const directory = join(process.cwd(), '.data', 'video-exports');
  await mkdir(directory, {recursive: true, mode: 0o700});
  const path = join(directory, `${hash}.mp4`);
  try { return await readFile(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const pending = exportsInProgress.get(hash);
  if (pending) return pending;
  if (exportsInProgress.size >= 2) throw new Error('EXPORT_BUSY');
  const task = (async () => {
    const mp4 = await finalizeRecording(data, type, true);
    const temporary = `${path}.tmp`;
    await writeFile(temporary, mp4, {mode: 0o600});
    await rename(temporary, path);
    return mp4;
  })().finally(() => exportsInProgress.delete(hash));
  exportsInProgress.set(hash, task);
  return task;
}
