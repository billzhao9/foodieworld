import { ApiError } from "./upstream";

/** Keep snapshot-bound resource tokens while stripping upstream viewer credentials. */
export function localizeManagedPlaylist(text: string, finiteSnapshot = false): string {
  const localized = text.replace(/(\d+\.m4s)\?[^\s"\r\n]+/g, (entry, path: string) => {
    const token = new URL(entry, "https://viewer.invalid").searchParams.get("r");
    if (!token || token.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(token))
      throw new ApiError("INVALID_MANAGED_PLAYBACK", 502);
    return `${path}?r=${token}`;
  });
  if (!finiteSnapshot) return localized;
  // Provider recordings are complete snapshots with independently signed URLs,
  // not an append-only HLS event. Native Safari must finish one immutable view
  // before the viewer explicitly loads a newer snapshot at the saved position.
  return localized
    .replace(/^#EXT-X-PLAYLIST-TYPE:.*$/gm, "")
    .replace(/^#EXT-X-ENDLIST\s*$/gm, "")
    .replace("#EXTM3U", "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD")
    .trimEnd() + "\n#EXT-X-ENDLIST\n";
}
