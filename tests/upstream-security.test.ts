import { afterEach, describe, expect, it, vi } from "vitest";
import { makeUpstream, sanitizeUpstreamCode } from "../server/upstream";
import { createApp } from "../server/app";
import type { Config } from "../server/config";
import type { Database } from "../server/db";
const config: Config = {
  environment: "production",
  password: "test",
  secret: "test-session-secret",
  databaseUrl: "",
  baseUrl: "https://upstream.test",
  apiKey: "dummy-enterprise-key",
  secure: true,
  port: 4174,
  host: "127.0.0.1",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("upstream error trust boundary", () => {
  it.each([
    { error: "Authorization: Bearer dummy-private-token" },
    { error: { code: "DUMMY_PRIVATE_TOKEN", message: "private" } },
    { error: { code: "invalid_key: dummy-private-token" } },
  ])("never forwards arbitrary upstream error data", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body), { status: 403 })),
    );
    await expect(makeUpstream(config)("/test")).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "UPSTREAM_ERROR",
      status: 403,
    });
  });
  it.each([
    "INSUFFICIENT_BALANCE",
    "insufficient_balance",
    "invalid_key",
    "agent_server_warming_up",
    "RATE_LIMITED",
  ])("preserves actionable code %s", (code) => {
    expect(sanitizeUpstreamCode(code)).toBe(code);
  });
  it("hides fetch exception details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("dummy-private-token")),
    );
    await expect(makeUpstream(config)("/test")).rejects.toMatchObject({
      code: "UPSTREAM_UNREACHABLE",
      message: "UPSTREAM_UNREACHABLE",
    });
  });
});
describe("production mutation origins", () => {
  const request = (origin: string, environment = "production") => {
    const { app } = createApp(
      { ...config, environment },
      {} as Database,
      vi.fn(),
    );
    // Invalid input reaches validation but never touches a database or a provider.
    return app.request("https://foodieworld.mmlone.com/api/auth/login", {
      method: "POST",
      headers: {
        origin,
        host: "foodieworld.mmlone.com",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  };
  it.each([
    "http://foodieworld.mmlone.com",
    "https://evil.test",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "null",
    "not-an-origin",
  ])("rejects %s", async (origin) => {
    vi.stubEnv("APP_ORIGINS", origin);
    const response = await request(origin);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_ORIGIN" },
    });
  });
  it("accepts the exact HTTPS production origin", async () => {
    expect((await request("https://foodieworld.mmlone.com")).status).toBe(400);
  });
  it("retains local development origins", async () => {
    expect((await request("http://localhost:5174", "development")).status).toBe(
      400,
    );
  });
});
