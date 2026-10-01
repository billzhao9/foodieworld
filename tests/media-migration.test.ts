import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  migrate: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../server/config", () => ({
  loadConfig: () => ({
    databaseUrl: "unused",
    environment: "test",
    mediaArchive: false,
  }),
}));
vi.mock("../server/db", () => ({
  Database: class {
    pool = { query: mocks.query };
    migrate = mocks.migrate;
    close = mocks.close;
  },
}));
afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.resetModules();
});
it("explains an old schema without implicitly changing it or attempting imports", async () => {
  mocks.query.mockResolvedValue({
    rows: [{ attname: "id" }, { attname: "created_at" }],
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../scripts/migrate-media");
  expect(process.exitCode).toBe(2);
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.query.mock.calls[0][0]).toMatch(/^SELECT attname/);
  expect(mocks.migrate).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith(
    "MEDIA_MIGRATION_SCHEMA_NOT_READY",
    expect.objectContaining({
      missingColumns: [
        "media_archive_scope",
        "media_archive_status",
        "video_status",
      ],
    }),
  );
});
