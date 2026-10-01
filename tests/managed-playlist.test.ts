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
it("serves immutable native snapshots as finite VOD without rotating-refresh semantics", () => {
  const event = '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXT-X-TARGETDURATION:4\n#EXT-X-MAP:URI="0.m4s?ticket=private&r=init"\n#EXTINF:4,\n1.m4s?ticket=private&r=segment\n';
  const result = localizeManagedPlaylist(event, true);
  expect(result).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
  expect(result).not.toContain('EVENT');
  expect(result).not.toContain('private');
  expect(result.endsWith('#EXT-X-ENDLIST\n')).toBe(true);
  expect(localizeManagedPlaylist(result, true).match(/#EXT-X-ENDLIST/g)).toHaveLength(1);
  expect(localizeManagedPlaylist(event)).toContain('EVENT');
});
