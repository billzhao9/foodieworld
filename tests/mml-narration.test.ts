import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../server/db";
import type { Config } from "../server/config";
import {
  makeMmlNarration,
  narrationMimeType,
  NARRATION_VOICES,
  MML_NARRATION_NAMESPACE,
} from "../server/mml-narration";
const config = {
  baseUrl: "https://mmlone.com",
  apiKey: "secret-test-key",
} as Config;
const url = "https://quiet-cat-123.convex.cloud/api/storage/audio-id";
const audio = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(32)]);
function database() {
  const rows = new Map<
    string,
    { state: string; url?: string; job_id?: string }
  >();
  const query = vi.fn(async (sql: string, params: string[]) => {
    const key = params[0]!;
    if (sql.startsWith("INSERT")) {
      if (rows.has(key)) return { rows: [] };
      rows.set(key, { state: "pending" });
      return { rows: [{ key }] };
    }
    if (sql.startsWith("SELECT"))
      return { rows: rows.has(key) ? [rows.get(key)] : [] };
    if (sql.includes("SET job_id="))
      rows.set(key, { state: "pending", job_id: params[1] });
    if (sql.includes("state='done'"))
      rows.set(key, { state: "done", url: params[1] });
    if (sql.includes("state='unknown'")) rows.set(key, { state: "unknown" });
    return { rows: [] };
  });
  return { db: { pool: { query } } as unknown as Database, rows };
}
function toolReply(value: unknown) {
  return new Response(
    JSON.stringify({
      result: { content: [{ type: "text", text: JSON.stringify(value) }] },
    }),
  );
}
function reply(status = "done", media = url) {
  return new Response(
    JSON.stringify({
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status,
              [status === "partial" ? "done" : "data"]: {
                url: media,
                storageId: "audio-id",
              },
            }),
          },
        ],
      },
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("MML narration receipts", () => {
  it("dispatches once, uses server auth only and partitions language keys", async () => {
    const { db, rows } = database();
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST"
        ? (() => {
            const name = JSON.parse(String(init.body)).params.name;
            return name === "runAudioTool"
              ? toolReply({
                  data: {
                    jobs: [{ kind: "personalAudioJobs", id: "fish-job" }],
                  },
                })
              : name === "getJobs"
                ? toolReply({
                    data: {
                      jobs: [{ id: "fish-job", status: "completed", url }],
                    },
                  })
                : reply();
          })()
        : new Response(audio),
    );
    vi.stubGlobal("fetch", fetcher);
    const synth = makeMmlNarration(config, db);
    expect(await synth("你好", "zh")).toEqual(audio);
    await synth("你好", "zh");
    expect(
      fetcher.mock.calls.filter((call) => call[1]?.method === "POST"),
    ).toHaveLength(2);
    await synth("你好", "en");
    expect(rows.size).toBe(2);
    const posts = fetcher.mock.calls.filter(
      (call) => call[1]?.method === "POST",
    );
    expect(posts[0]![1]!.headers).toMatchObject({
      Authorization: "Bearer secret-test-key",
      Accept: "application/json, text/event-stream",
    });
    expect(
      JSON.parse(posts[0]![1]!.body as string).params.arguments.voiceId,
    ).toBe(NARRATION_VOICES.zh);
    expect(
      JSON.parse(posts[2]![1]!.body as string).params.arguments.voiceId,
    ).toBe(NARRATION_VOICES.en);
    expect(NARRATION_VOICES.zh).not.toBe(NARRATION_VOICES.en);
    expect(MML_NARRATION_NAMESPACE).toContain(NARRATION_VOICES.zh);
    expect(MML_NARRATION_NAMESPACE).toContain(NARRATION_VOICES.en);
    expect(MML_NARRATION_NAMESPACE).not.toContain(":default");
    for (const call of fetcher.mock.calls.filter(
      (call) => call[1]?.method !== "POST",
    ))
      expect(call[1]?.headers).toBeUndefined();
  });
  it("resumes a saved Fish job after a polling failure without paying twice", async () => {
    const { db } = database();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        toolReply({
          data: { jobs: [{ kind: "personalAudioJobs", id: "fish-job" }] },
        }),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        toolReply({
          data: { jobs: [{ id: "fish-job", status: "completed", url }] },
        }),
      )
      .mockResolvedValueOnce(new Response(audio));
    vi.stubGlobal("fetch", fetcher);
    const synth = makeMmlNarration(config, db);
    await expect(synth("中文", "zh")).rejects.toThrow(
      "NARRATION_STATUS_UNAVAILABLE",
    );
    expect(await synth("中文", "zh")).toEqual(audio);
    expect(
      fetcher.mock.calls.filter(
        (c) =>
          c[1]?.body && JSON.parse(c[1].body).params.name === "runAudioTool",
      ),
    ).toHaveLength(1);
  });
  it("blocks resubmission after an unknown transport result without leaking secrets", async () => {
    const { db } = database();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error("secret-test-key upstream details"));
    vi.stubGlobal("fetch", fetcher);
    const synth = makeMmlNarration(config, db);
    await expect(synth("hello", "en")).rejects.toThrow(
      "NARRATION_OUTCOME_UNKNOWN",
    );
    await expect(synth("hello", "en")).rejects.toThrow(
      "NARRATION_OUTCOME_UNKNOWN",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retries downloads from a partial receipt without repeating synthesis", async () => {
    const { db } = database();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply("partial"))
      .mockRejectedValueOnce(new Error("download offline"))
      .mockResolvedValueOnce(new Response(audio));
    vi.stubGlobal("fetch", fetcher);
    const synth = makeMmlNarration(config, db);
    await expect(synth("hello", "en")).rejects.toThrow(
      "NARRATION_DOWNLOAD_FAILED",
    );
    expect(await synth("hello", "en")).toEqual(audio);
    expect(
      fetcher.mock.calls.filter((call) => call[1]?.method === "POST"),
    ).toHaveLength(1);
  });
  it("accepts MCP SSE results", async () => {
    const { db } = database();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.method !== "POST") return new Response(audio);
        const id = (JSON.parse(String(init.body)) as { id: string }).id;
        const result = await reply().json();
        return new Response(
          `event: message\ndata: ${JSON.stringify({ id, ...result })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      }),
    );
    expect(await makeMmlNarration(config, db)("hello", "en")).toEqual(audio);
  });
  it("treats MCP isError as unknown and blocks redirects to private destinations", async () => {
    const { db } = database();
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            isError: true,
            content: [{ type: "text", text: "secret-test-key" }],
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const synth = makeMmlNarration(config, db);
    await expect(synth("failed", "en")).rejects.toThrow(
      "NARRATION_OUTCOME_UNKNOWN",
    );
    fetcher.mockResolvedValueOnce(reply()).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private" },
      }),
    );
    await expect(synth("other", "en")).rejects.toThrow(
      "NARRATION_INVALID_MEDIA_URL",
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects invalid audio and oversized declared downloads", async () => {
    expect(() => narrationMimeType(Buffer.from("not audio"))).toThrow(
      "NARRATION_INVALID_AUDIO",
    );
    const { db } = database();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(reply())
        .mockResolvedValueOnce(
          new Response("large", { headers: { "content-length": "999999999" } }),
        ),
    );
    await expect(makeMmlNarration(config, db)("hello", "en")).rejects.toThrow(
      "NARRATION_AUDIO_TOO_LARGE",
    );
  });
});
