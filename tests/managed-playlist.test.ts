import { describe, expect, it } from "vitest";
import { localizeManagedPlaylist } from "../server/managed-playlist";
describe("managed playlist proxy", () => {
  it("retains snapshot tokens for initialization and segments without leaking viewer tickets", () => {
    const result = localizeManagedPlaylist('#EXTM3U\n#EXT-X-MAP:URI="0.m4s?ticket=private&r=sealed_A"\n1.m4s?r=sealed_B&ticket=private');
    expect(result).toBe('#EXTM3U\n#EXT-X-MAP:URI="0.m4s?r=sealed_A"\n1.m4s?r=sealed_B');
    expect(result).not.toContain("private");
  });
  it("rejects resource URLs missing their snapshot binding", () => {
    expect(() => localizeManagedPlaylist("#EXTM3U\n0.m4s?ticket=private")).toThrow();
  });
});
