import { expect, it } from "vitest";
import { fragmentedMp4, finalizeRecording } from "../server/recording";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
let ffmpegAvailable = false;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  ffmpegAvailable = true;
} catch {}
it("does not confuse fragment-like payload text with a top-level MP4 fragment", async () => {
  const data = Buffer.from("not a video moof");
  expect(fragmentedMp4(data)).toBe(false);
  expect(await finalizeRecording(data, "video/webm")).toBe(data);
});
it.skipIf(!ffmpegAvailable)(
  "converts fragmented MP4 to seekable H.264 with stable timing",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "fw-remux-test-"));
    try {
      const input = join(directory, "input.mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=64x64:r=10",
        "-t",
        "0.5",
        "-c:v",
        "mpeg4",
        "-movflags",
        "frag_keyframe+empty_moov",
        input,
      ]);
      const source = await readFile(input);
      expect(fragmentedMp4(source)).toBe(true);
      const result = await finalizeRecording(source, "video/mp4");
      expect(fragmentedMp4(result)).toBe(false);
      expect(result.indexOf(Buffer.from("moov"))).toBeLessThan(
        result.indexOf(Buffer.from("mdat")),
      );
      const file = join(directory, "result.mp4");
      await (await import("node:fs/promises")).writeFile(file, result);
      const info = JSON.parse(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,width,height,r_frame_rate,duration",
          "-of",
          "json",
          file,
        ]).toString(),
      ).streams[0];
      expect(info.codec_name).toBe("h264");
      expect([info.width, info.height, info.r_frame_rate]).toEqual([
        1280,
        720,
        "30/1",
      ]);
      expect(Number(info.duration)).toBeCloseTo(0.5, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
