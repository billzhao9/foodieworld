import { expect, it } from "vitest";
import { fragmentedMp4, finalizeRecording, exportMp4 } from "../server/recording";
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

it.skipIf(!ffmpegAvailable)("exports WebM as a cached Photos-compatible H.264 MP4", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fw-export-test-"));
  try {
    const input = join(directory, "input.webm");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=10", "-t", "0.3", "-c:v", "libvpx-vp9", input]);
    const source = await readFile(input);
    const [result, duplicate] = await Promise.all([exportMp4(source, "video/webm"), exportMp4(source, "video/webm")]);
    expect(duplicate.equals(result)).toBe(true);
    expect((await exportMp4(source, "video/webm")).equals(result)).toBe(true);
    const output = join(directory, "output.mp4");
    await (await import("node:fs/promises")).writeFile(output, result);
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,pix_fmt", "-of", "json", output]).toString());
    expect(info.streams[0]).toMatchObject({codec_name: "h264", pix_fmt: "yuv420p"});
    expect(fragmentedMp4(result)).toBe(false);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

it.skipIf(!ffmpegAvailable)("losslessly repackages compatible H.264 without resizing or re-encoding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fw-copy-test-"));
  try {
    const input=join(directory,"input.mp4");
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=green:s=64x64:r=10","-t","0.5","-c:v","libx264","-pix_fmt","yuv420p","-bf","0","-movflags","frag_keyframe+empty_moov",input]);
    const source=await readFile(input);
    const result=await finalizeRecording(source,"video/mp4");
    const output=join(directory,"output.mp4");
    await (await import("node:fs/promises")).writeFile(output,result);
    const stream=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_name,width,height","-of","json",output]).toString()).streams[0];
    expect(stream).toMatchObject({codec_name:"h264",width:64,height:64});
    expect(fragmentedMp4(result)).toBe(false);
    expect(result.indexOf(Buffer.from("moov"))).toBeLessThan(result.indexOf(Buffer.from("mdat")));
  } finally {await rm(directory,{recursive:true,force:true});}
});
