import { z } from "zod";
import type { Config } from "./config";
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 502,
  ) {
    super(code);
  }
}
// Only documented, user-actionable codes may cross the upstream trust boundary.
const publicUpstreamCodes = new Set([
  "RATE_LIMITED",
  "rate_limited",
  "INSUFFICIENT_BALANCE",
  "insufficient_balance",
  "invalid_key",
  "UNAUTHORIZED",
  "agent_server_warming_up",
  "UPSTREAM_UNREACHABLE",
]);
export function sanitizeUpstreamCode(code: unknown): string {
  return typeof code === "string" && publicUpstreamCodes.has(code)
    ? code
    : "UPSTREAM_ERROR";
}
export type Upstream = (path: string, body?: unknown) => Promise<unknown>;
export function makeUpstream(config: Config): Upstream {
  return async (path, body) => {
    if (!config.apiKey) throw new ApiError("API_NOT_CONFIGURED", 503);
    let res: Response;
    try {
      res = await fetch(
        `${config.baseUrl.replace(/\/$/, "")}/v1/enterprise${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(
            path.includes("text-generations") ? 120000 : 70000,
          ),
        },
      );
    } catch {
      throw new ApiError("UPSTREAM_UNREACHABLE", 503);
    }
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const value = z
        .object({
          error: z.union([z.string(), z.object({ code: z.string() })]),
        })
        .safeParse(data);
      const code = value.success
        ? typeof value.data.error === "string"
          ? value.data.error
          : value.data.error.code
        : "UPSTREAM_ERROR";
      throw new ApiError(sanitizeUpstreamCode(code), res.status);
    }
    return data;
  };
}
export async function generate<T>(
  upstream: Upstream,
  requestId: string,
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = z.object({ text: z.string() }).parse(
    await upstream("/text-generations", {
      requestId,
      prompt,
      model: "gpt-5.4-mini",
      maxOutputTokens: 1800,
    }),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      raw.text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
  } catch {
    throw new ApiError("INVALID_AI_OUTPUT");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new ApiError("INVALID_AI_OUTPUT");
  return result.data;
}
