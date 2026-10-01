import { createHash } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";
import { ApiError } from "./upstream";

/** Enterprise credentials stay on the server; callers receive stable asset IDs. */
export class MediaArchive {
  constructor(private readonly config: Pick<Config, "baseUrl" | "apiKey">) {}
  async save(input: { requestId: string; title: string; bytes: Buffer; mimeType: string; kind: "image" | "video" | "audio"; fileName: string }) {
    const metadata = {
      requestId: input.requestId, title: input.title, kind: input.kind,
      mimeType: input.mimeType, applicationRef: "foodieworld",
      expectedBytes: input.bytes.length,
      expectedSha256: createHash("sha256").update(input.bytes).digest("hex"),
    };
    const response = await fetch(`${this.config.baseUrl}/v1/enterprise/assets/import`, {
      method: "POST", headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": input.mimeType, "Content-Length": String(input.bytes.length),
        "X-Media-Metadata": Buffer.from(JSON.stringify(metadata)).toString("base64url"),
        "X-Media-Filename": input.fileName,
      }, body: new Uint8Array(input.bytes), signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new ApiError("MEDIA_ARCHIVE_PENDING", 503);
    return z.object({ assetId: z.string() }).parse(await response.json()).assetId;
  }
  async publish(assetId: string): Promise<string> {
    const headers = { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" };
    const detail = await fetch(`${this.config.baseUrl}/v1/enterprise/assets/${encodeURIComponent(assetId)}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!detail.ok) throw new ApiError("MEDIA_ARCHIVE_PENDING", 503);
    const asset = z.object({ files: z.array(z.object({ id: z.string(), role: z.string() })) }).parse(await detail.json());
    const file = asset.files.find(f => f.role === "playback") ?? asset.files.find(f => f.role === "original");
    if (!file) throw new ApiError("MEDIA_ARCHIVE_PENDING", 503);
    const response = await fetch(`${this.config.baseUrl}/v1/enterprise/assets/${encodeURIComponent(assetId)}/publication`, {
      method: "POST", headers, body: JSON.stringify({ fileId: file.id, applicationRef: "foodieworld" }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError("MEDIA_ARCHIVE_PENDING", 503);
    const { path } = z.object({ path: z.string().regex(/^\/media\/published\/[A-Za-z0-9%-]+$/) }).parse(await response.json());
    return new URL(path, this.config.baseUrl).href;
  }
  publicationUrl(value: string, request: Request): string {
    const url = new URL(value);
    const base = new URL(this.config.baseUrl);
    if (url.origin !== base.origin || url.username || url.password || url.hash || url.search || !/^\/media\/published\/[A-Za-z0-9%-]+$/.test(url.pathname)) throw new ApiError("MEDIA_ARCHIVE_PENDING", 503);
    if (new URL(request.url).searchParams.get("download") === "1") url.searchParams.set("download", "1");
    return url.href;
  }
  async read(assetId: string, request: Request): Promise<Response> {
    const headers = new Headers({ Authorization: `Bearer ${this.config.apiKey}` });
    for (const name of ["range", "if-range"]) { const value = request.headers.get(name); if (value) headers.set(name, value); }
    const download = new URL(request.url).searchParams.get("download") === "1" ? "?download=1" : "";
    const response = await fetch(`${this.config.baseUrl}/v1/enterprise/assets/${encodeURIComponent(assetId)}/content${download}`, { method: request.method === "HEAD" ? "HEAD" : "GET", headers, signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]), redirect: "error" });
    const output = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition", "etag", "last-modified"]) { const value = response.headers.get(key); if (value) output.set(key, value); }
    if (![200, 206, 416].includes(response.status)) { await response.body?.cancel(); return new Response(null, { status: response.status === 403 || response.status === 404 ? 404 : 503, headers: output }); }
    return new Response(response.body, { status: response.status, headers: output });
  }
}
