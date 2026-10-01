import type HlsInstance from "hls.js";
import { prepareLiveAudio, type LivePlayer } from "./live";
/** Viewer transport only: closing this player never sends a generation stop. */
export async function connectManagedLive(args: {
  video: HTMLVideoElement;
  url: string;
  muted: boolean;
  audioContext?: AudioContext;
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
  const context = args.audioContext ?? prepareLiveAudio();
  const gain = context?.createGain();
  gain?.connect(context!.destination);
  if (gain) gain.gain.value = args.muted ? 0 : 1;
  let speech: AudioBufferSourceNode | undefined;
  let speechSequence = 0;
  let soundMuted = args.muted;
  video.srcObject = null;
  video.muted = soundMuted;
  const play = async () => {
    try {
      await video.play();
    } catch (error) {
      if (closed || userPaused) return;
      // A not-yet-ready playlist can reject play too. Only a real autoplay
      // permission denial should ask the visitor to enable sound again.
      if (!(error instanceof Error) || error.name !== "NotAllowedError") return;
      soundMuted = true;
      if (gain) gain.gain.value = 0;
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
    let stall: ReturnType<typeof setTimeout> | undefined;
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
      if (ignoreLoadPause) return;
      if (closed || video.ended || video.error || video.readyState === 0) return;
      userPaused = true;
      clearTimeout(reconnect);
      reconnect = undefined;
    };
    const progressed = () => {
      ignoreLoadPause = false;
      clearTimeout(stall);
    };
    const stalled = () => {
      clearTimeout(stall);
      stall = setTimeout(() => { if (!userPaused && !closed) retry(); }, 6000);
    };
    const unpaused = () => {
      userPaused = false;
      clearTimeout(reconnect);
      reconnect = undefined;
      resumeAt = undefined;
      retries = 0;
    };
    video.addEventListener("timeupdate", progressed);
    video.addEventListener("waiting", stalled);
    video.addEventListener("stalled", stalled);
    video.addEventListener("error", retry);
    video.addEventListener("ended", ended);
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("pause", paused);
    video.addEventListener("play", unpaused);
    removeNativeListeners = () => {
      clearTimeout(stall);
      video.removeEventListener("timeupdate", progressed);
      video.removeEventListener("waiting", stalled);
      video.removeEventListener("stalled", stalled);
      video.removeEventListener("error", retry);
      video.removeEventListener("ended", ended);
      video.removeEventListener("loadedmetadata", metadata);
      video.removeEventListener("pause", paused);
      video.removeEventListener("play", unpaused);
    };
    // Start loading explicitly: iOS may not publish metadata until playback
    // is requested, especially while the preview is covered by its poster.
    void play();
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
    speechSequence++;
    try { speech?.stop(); } catch { /* The previous buffer may have ended. */ }
    speech?.disconnect();
    speech = undefined;
  }
  return {
    // Managed commands are delivered by the authenticated backend, never the viewer.
    async update() {},
    async updateAudio() {},
    setMuted(value) {
      soundMuted = value;
      video.muted = value;
      if (gain) gain.gain.value = value ? 0 : 1;
    },
    async resumeAudio() {
      if (context?.state === "suspended") await context.resume();
      video.muted = soundMuted;
      await video.play();
    },
    async speak(bytes) {
      stopSpeech();
      if (closed) return;
      if (!context || !gain) throw new Error("NARRATION_UNAVAILABLE");
      const sequence = speechSequence;
      const buffer = await context.decodeAudioData(bytes.slice(0));
      if (closed || sequence !== speechSequence) return;
      if (context.state !== "running") {
        // Recovery after navigation may require a fresh user gesture. This is
        // playback permission, not a failed synthesis request.
        args.onAudioBlocked();
        return;
      }
      speech = context.createBufferSource();
      speech.buffer = buffer;
      speech.connect(gain);
      speech.start();
    },
    stopSpeech,
    async close() {
      closed = true;
      clearTimeout(reconnect);
      stopSpeech();
      gain?.disconnect();
      if (context && context.state !== "closed") await context.close().catch(() => {});
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
