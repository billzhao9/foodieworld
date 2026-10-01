import type HlsInstance from "hls.js";
import type { LivePlayer } from "./live";
/** Viewer transport only: closing this player never sends a generation stop. */
export async function connectManagedLive(args: {
  video: HTMLVideoElement;
  url: string;
  muted: boolean;
  onPlaying: () => void;
  onAudioBlocked: () => void;
  onError: () => void;
}): Promise<LivePlayer> {
  const video = args.video;
  let closed = false;
  let hls: HlsInstance | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let removeNativeListeners: (() => void) | undefined;
  let userPaused = false;
  let speech: HTMLAudioElement | undefined;
  let speechUrl: string | undefined;
  let soundMuted = args.muted;
  video.srcObject = null;
  video.muted = soundMuted;
  const play = async () => {
    try {
      await video.play();
    } catch {
      if (closed || userPaused) return;
      video.muted = true;
      args.onAudioBlocked();
      await video.play().catch(() => undefined);
    }
  };
  const playing = () => {
    if (!closed) args.onPlaying();
  };
  video.addEventListener("playing", playing);
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = args.url;
    let resumeAt: number | undefined;
    let retries = 0;
    let ignoreLoadPause = false;
    const schedule = () => {
      if (closed || userPaused || reconnect !== undefined) return;
      if (retries >= 60) {
        if (retries === 60) {
          retries++;
          args.onError();
        }
        return;
      }
      reconnect = setTimeout(() => {
        reconnect = undefined;
        if (closed || userPaused) return;
        retries++;
        ignoreLoadPause = !video.paused;
        // Safari treats each materialized snapshot as finite, even for EVENT HLS.
        // Loading a newer manifest must not replay the old snapshot from zero.
        video.load();
      }, 2000);
    };
    const ended = () => {
      if (closed || userPaused) return;
      resumeAt = Math.max(resumeAt ?? 0, video.currentTime);
      schedule();
    };
    const retry = () => {
      if (video.currentTime > 0)
        resumeAt = Math.max(resumeAt ?? 0, video.currentTime);
      schedule();
    };
    const metadata = () => {
      ignoreLoadPause = false;
      if (closed || userPaused) return;
      if (resumeAt !== undefined) {
        const end = Number.isFinite(video.duration)
          ? video.duration
          : video.seekable.length
            ? video.seekable.end(video.seekable.length - 1)
            : 0;
        if (end <= resumeAt + 0.05 || !Number.isFinite(end)) {
          schedule();
          return;
        }
        try {
          video.currentTime = resumeAt;
        } catch {
          schedule();
          return;
        }
        resumeAt = undefined;
      }
      retries = 0;
      void play();
    };
    const paused = () => {
      if (ignoreLoadPause) {
        ignoreLoadPause = false;
        return;
      }
      if (closed || video.ended) return;
      userPaused = true;
      clearTimeout(reconnect);
      reconnect = undefined;
    };
    const unpaused = () => {
      userPaused = false;
      clearTimeout(reconnect);
      reconnect = undefined;
      resumeAt = undefined;
      retries = 0;
    };
    video.addEventListener("error", retry);
    video.addEventListener("ended", ended);
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("pause", paused);
    video.addEventListener("play", unpaused);
    removeNativeListeners = () => {
      video.removeEventListener("error", retry);
      video.removeEventListener("ended", ended);
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("pause", paused);
      video.removeEventListener("play", unpaused);
    };
  } else {
    const { default: Hls } = await import("hls.js");
    if (!Hls.isSupported()) throw new Error("HLS_UNSUPPORTED");
    hls = new Hls({
      lowLatencyMode: false,
      backBufferLength: 100,
      liveSyncDurationCount: 2,
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => void play());
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (closed || !data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        reconnect = setTimeout(() => {
          if (!closed) hls?.loadSource(args.url);
        }, 2000);
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR)
        hls?.recoverMediaError();
      else args.onError();
    });
    hls.loadSource(args.url);
    hls.attachMedia(video);
  }
  function stopSpeech() {
    speech?.pause();
    speech = undefined;
    if (speechUrl) URL.revokeObjectURL(speechUrl);
    speechUrl = undefined;
  }
  return {
    // Managed commands are delivered by the authenticated backend, never the viewer.
    async update() {},
    async updateAudio() {},
    setMuted(value) {
      soundMuted = value;
      video.muted = value;
      if (speech) speech.muted = value;
    },
    async resumeAudio() {
      video.muted = soundMuted;
      await video.play();
    },
    async speak(bytes) {
      stopSpeech();
      if (closed) return;
      speechUrl = URL.createObjectURL(
        new Blob([bytes], { type: "audio/mpeg" }),
      );
      speech = new Audio(speechUrl);
      speech.muted = soundMuted;
      await speech.play();
    },
    stopSpeech,
    async close() {
      closed = true;
      clearTimeout(reconnect);
      stopSpeech();
      hls?.destroy();
      removeNativeListeners?.();
      video.removeEventListener("playing", playing);
      video.pause();
      video.removeAttribute("src");
      video.load();
      return null;
    },
  };
}
