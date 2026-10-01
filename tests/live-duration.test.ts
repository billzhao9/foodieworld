import { expect, it, vi } from "vitest";
import { LiveSessions } from "../server/live";
import { LIVE_ROUND_SECONDS, LIVE_RESERVATION_SECONDS } from "../shared/limits";
it("reserves a supported tier but enforces a 90-second app deadline", async () => {
  const query = vi.fn(async (sql: string) => ({rows: sql.startsWith("UPDATE") ? [{stop_requested: false}] : [], rowCount: 0}));
  const db = {pool: {query}, transaction: (fn: any) => fn({query})};
  const up = vi.fn().mockResolvedValue({sessionId: "provider", connection: {protocol: "webrtc", apiBase: "https://example.com", sessionId: "session", jwt: "test", modelSlug: "visko-orbis-stable"}});
  const crafts = {read: async () => ({imageUrl: "https://example.com/image", opening: {videoPrompt: "pizza"}})};
  const before = Date.now();
  const live = new LiveSessions(db as any, up, crafts as any);
  const session = await live.start("craft", "owner");
  expect(LIVE_ROUND_SECONDS).toBe(90);
  expect(LIVE_RESERVATION_SECONDS).toBe(120);
  expect(up).toHaveBeenCalledWith("/live-sessions", expect.objectContaining({seconds: 120}));
  expect(session.expiresAt).toBeGreaterThanOrEqual(before + 90000);
  expect(session.expiresAt).toBeLessThanOrEqual(Date.now() + 90000);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SET upstream_id"), expect.arrayContaining([session.expiresAt]));
});
