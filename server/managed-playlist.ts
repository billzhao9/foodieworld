import { ApiError } from "./upstream";

/** Keep snapshot-bound resource tokens while stripping upstream viewer credentials. */
export function localizeManagedPlaylist(text: string): string {
  return text.replace(/(\d+\.m4s)\?[^\s"\r\n]+/g, (entry, path: string) => {
    const token = new URL(entry, "https://viewer.invalid").searchParams.get("r");
    if (!token || token.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(token))
      throw new ApiError("INVALID_MANAGED_PLAYBACK", 502);
    return `${path}?r=${token}`;
  });
}
