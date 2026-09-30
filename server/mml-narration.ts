import { createHash } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";
import type { Database } from "./db";
import type { NarrationSynthesizer } from "./narration";
import { ApiError } from "./upstream";

const MODEL = "elevenlabs-flash-v2-5-tts";
export const MML_NARRATION_NAMESPACE = `mml-v1:${MODEL}:default`;
const MAX_AUDIO = 12 * 1024 * 1024;
const receiptSchema = z.object({
  url: z.string().url(),
  storageId: z.string().min(1),
});
const resultSchema = z.union([
  z.object({ status: z.literal("done"), data: receiptSchema }),
  z.object({ status: z.literal("partial"), done: receiptSchema }),
]);

export function narrationMimeType(audio: Buffer): "audio/wav" | "audio/mpeg" {
  if (
    audio.length >= 44 &&
    audio.toString("ascii", 0, 4) === "RIFF" &&
    audio.toString("ascii", 8, 12) === "WAVE"
  )
    return "audio/wav";
  if (
    audio.length >= 10 &&
    (audio.toString("ascii", 0, 3) === "ID3" ||
      (audio[0] === 0xff &&
        (audio[1]! & 0xe0) === 0xe0 &&
        (audio[1]! & 0x06) !== 0))
  )
    return "audio/mpeg";
  throw new ApiError("NARRATION_INVALID_AUDIO", 502);
}
function mediaUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("NARRATION_INVALID_MEDIA_URL", 502);
  }
  // MML previewTts stores the result in Convex, then returns storage.getUrl.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !/^[a-z0-9-]+\.convex\.(cloud|site)$/.test(url.hostname) ||
    !url.pathname.startsWith("/api/storage/")
  )
    throw new ApiError("NARRATION_INVALID_MEDIA_URL", 502);
  return url;
}
async function download(value: string): Promise<Buffer> {
  let url = mediaUrl(value);
  try {
    const signal = AbortSignal.timeout(30000);
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url, { redirect: "manual", signal });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        if (!location) throw new ApiError("NARRATION_DOWNLOAD_FAILED", 502);
        url = mediaUrl(new URL(location, url).href);
        continue;
      }
      if (!res.ok || !res.body)
        throw new ApiError("NARRATION_DOWNLOAD_FAILED", 502);
      if (Number(res.headers.get("content-length")) > MAX_AUDIO) {
        await res.body.cancel();
        throw new ApiError("NARRATION_AUDIO_TOO_LARGE", 502);
      }
      const reader = res.body.getReader();
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_AUDIO)
            throw new ApiError("NARRATION_AUDIO_TOO_LARGE", 502);
          chunks.push(Buffer.from(part.value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = Buffer.concat(chunks);
      narrationMimeType(bytes);
      return bytes;
    }
    throw new ApiError("NARRATION_DOWNLOAD_FAILED", 502);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("NARRATION_DOWNLOAD_FAILED", 502);
  }
}

export function makeMmlNarration(
  config: Config,
  db: Database,
): NarrationSynthesizer {
  return async (text, language) => {
    if (!config.apiKey) throw new ApiError("API_NOT_CONFIGURED", 503);
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          config.baseUrl,
          MML_NARRATION_NAMESPACE,
          language,
          text,
        ]),
      )
      .digest("hex");
    try {
      const claim = await db.pool.query(
        "INSERT INTO fw_voice_requests(key,state) VALUES($1,'pending') ON CONFLICT DO NOTHING RETURNING key",
        [key],
      );
      let url: string;
      if (!claim.rows.length) {
        const saved = await db.pool.query(
          "SELECT state,url FROM fw_voice_requests WHERE key=$1",
          [key],
        );
        const row = saved.rows[0];
        if (row?.state !== "done" || typeof row.url !== "string")
          throw new ApiError("NARRATION_OUTCOME_UNKNOWN", 409);
        url = row.url;
      } else {
        // There is deliberately no retry around this paid dispatch. A lost
        // response, crash, or ambiguous tool error leaves a durable barrier.
        try {
          const endpoint = new URL("/mcp", config.baseUrl);
          endpoint.searchParams.set("lang", language);
          const res = await fetch(endpoint, {
            method: "POST",
            redirect: "error",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: key,
              method: "tools/call",
              params: {
                name: "previewVoiceover",
                arguments: { provider: "elevenlabs", model: MODEL, text },
              },
            }),
            signal: AbortSignal.timeout(90000),
          });
          if (!res.ok) throw new Error("MCP_FAILED");
          const raw = await res.text();
          if (raw.length > 1024 * 1024)
            throw new Error("MCP_RESPONSE_TOO_LARGE");
          const responseBody: unknown = res.headers
            .get("content-type")
            ?.includes("text/event-stream")
            ? raw
                .split(/\r?\n\r?\n/)
                .flatMap((block) => {
                  const data = block
                    .split(/\r?\n/)
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trimStart())
                    .join("\n");
                  if (!data || data === "[DONE]") return [];
                  try {
                    return [JSON.parse(data) as unknown];
                  } catch {
                    return [];
                  }
                })
                .find(
                  (value) =>
                    typeof value === "object" &&
                    value !== null &&
                    "id" in value &&
                    value.id === key,
                )
            : (JSON.parse(raw) as unknown);
          const envelope = z
            .object({
              result: z.object({
                isError: z.boolean().optional(),
                content: z.array(
                  z.object({ type: z.string(), text: z.string().optional() }),
                ),
              }),
            })
            .parse(responseBody);
          if (envelope.result.isError) throw new Error("MCP_FAILED");
          const payload = envelope.result.content.find(
            (item) => item.type === "text" && item.text,
          )?.text;
          const parsed = resultSchema.parse(JSON.parse(payload ?? ""));
          const receipt = parsed.status === "done" ? parsed.data : parsed.done;
          // Save even before validating/downloading: synthesis already happened.
          await db.pool.query(
            "UPDATE fw_voice_requests SET state='done',url=$2,storage_id=$3 WHERE key=$1",
            [key, receipt.url, receipt.storageId],
          );
          url = receipt.url;
        } catch {
          await db.pool
            .query(
              "UPDATE fw_voice_requests SET state='unknown',error='NARRATION_OUTCOME_UNKNOWN' WHERE key=$1 AND state='pending'",
              [key],
            )
            .catch(() => {});
          throw new ApiError("NARRATION_OUTCOME_UNKNOWN", 502);
        }
      }
      return await download(url);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("NARRATION_STORAGE_UNAVAILABLE", 503);
    }
  };
}
