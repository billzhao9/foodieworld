export function beginReplay(
  video: HTMLVideoElement,
  src: string,
  report: (state: "loading" | "playing" | "blocked" | "error") => void,
): () => void {
  let disposed = false;
  let wantsPlayback = true;
  let retried = false;
  const play = () => {
    // Keep the first play() in the original click stack for iOS audio permission.
    void video.play().catch((error: unknown) => {
      if (disposed || !wantsPlayback) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      wantsPlayback = false;
      report(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "blocked"
          : "error",
      );
    });
  };
  const ready = () => {
    // Safari may finish loading after the initial hidden-to-visible transition.
    // Retry once, only while that initial user-requested start remains pending.
    if (!disposed && wantsPlayback && video.paused && !retried) {
      retried = true;
      play();
    }
  };
  const playing = () => {
    wantsPlayback = false;
    if (!disposed) report("playing");
  };
  const paused = () => {
    wantsPlayback = false;
  };
  const failed = () => {
    wantsPlayback = false;
    if (!disposed) report("error");
  };
  video.addEventListener("canplay", ready);
  video.addEventListener("playing", playing);
  video.addEventListener("pause", paused);
  video.addEventListener("seeking", paused);
  video.addEventListener("error", failed);
  report("loading");
  video.preload = "auto";
  if (video.getAttribute("src") !== src) {
    video.src = src;
    video.load();
  } else if (video.ended) video.currentTime = 0;
  play();
  return () => {
    disposed = true;
    wantsPlayback = false;
    video.removeEventListener("canplay", ready);
    video.removeEventListener("playing", playing);
    video.removeEventListener("pause", paused);
    video.removeEventListener("seeking", paused);
    video.removeEventListener("error", failed);
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}
