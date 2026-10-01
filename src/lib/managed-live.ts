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
    // Each provider recording is an immutable snapshot. Native Safari cannot
    // safely append snapshots whose init/segment URLs change on every refresh.
    video.src = `${args.url}${args.url.includes("?") ? "&" : "?"}snapshot=1`;
    let resumeAt: number | undefined;
    let retries = 0;
    let refreshing = false;
    let refreshController: AbortController | undefined;
    let ignoreLoadPause = false;
    let lastPosition = video.currentTime;
    let lastProgressAt = Date.now();
    const schedule = (delay = 2000) => {
      if (closed || userPaused || refreshing || reconnect !== undefined) return;
      if (retries >= 60) {
        if (retries === 60) {
          retries++;
          args.onError();
        }
        return;
      }
      lastPosition = video.currentTime;
      reconnect = setTimeout(async () => {
        reconnect = undefined;
        if (closed || userPaused) return;
        retries++;
        refreshing = true;
        refreshController = new AbortController();
        let retryLater = false;
        try {
          // Retain the last visible frame while the next snapshot is not ready.
          // Calling load() first clears it and can strand Safari at time zero.
          const response = await fetch(video.src, {
            cache: "no-store", credentials: "same-origin",
            signal: AbortSignal.any([refreshController.signal, AbortSignal.timeout(10000)]),
          });
          if (!response.ok) throw new Error("SNAPSHOT_NOT_READY");
          const playlist = await response.text();
          const duration = [...playlist.matchAll(/^#EXTINF:([\d.]+)/gm)]
            .reduce((sum, match) => sum + Number(match[1]), 0);
          if (closed || userPaused) return;
          if (resumeAt !== undefined && duration <= resumeAt + 0.05) {
            retryLater = true;
            return;
          }
          ignoreLoadPause = true;
          lastProgressAt = Date.now();
          video.load();
        } catch {
          retryLater = !closed && !userPaused;
        } finally {
          refreshing = false;
          refreshController = undefined;
          if (retryLater) schedule();
        }
      }, delay);
    };
    const ended = () => {
      if (closed || userPaused) return;
      resumeAt = Math.max(resumeAt ?? 0, video.currentTime);
      schedule(0);
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
        if (!Number.isFinite(end) || end <= 0) {
          // Native HLS can expose metadata before its duration/seekable ranges.
          // Playback must load media before a saved position can be restored.
          if (video.paused) void play();
          return;
        }
        if (end <= resumeAt + 0.05) {
          schedule();
          return;
        }
        try {
          video.currentTime = resumeAt;
          lastPosition = resumeAt;
        } catch {
          schedule();
          return;
        }
        resumeAt = undefined;
      }
      void play();
    };
    const paused = () => {
      if (ignoreLoadPause) return;
      if (closed || video.ended || video.error || video.readyState === 0) return;
      // The live surface has no pause control. Safari can pause it when scrolling
      // or backgrounding; that must not permanently disable viewer recovery.
      if (!video.controls) { retry(); return; }
      userPaused = true;
      clearTimeout(reconnect);
      reconnect = undefined;
    };
    const progressed = () => {
      if (resumeAt !== undefined) return;
      const position = video.currentTime;
      // timeupdate also fires during stalls and seeks. Only actual forward
      // movement proves the viewer has recovered.
      if (position > lastPosition + 0.01) {
        ignoreLoadPause = false;
        lastProgressAt = Date.now();
        retries = 0;
        lastPosition = position;
        clearTimeout(reconnect);
        reconnect = undefined;
        resumeAt = undefined;
      }
    };
    const catchUp = () => {
      if (video.controls || video.paused || !video.seekable.length) return;
      const range = video.seekable.length - 1;
      const edge = video.seekable.end(range);
      if (!Number.isFinite(edge) || edge - video.currentTime <= 20) return;
      try {
        // The live view follows new additions; the recording keeps skipped time.
        video.currentTime = Math.max(video.seekable.start(range), edge - 8);
        lastPosition = video.currentTime;
        lastProgressAt = Date.now();
      } catch { /* A changing seekable range is retried on the next tick. */ }
    };
    const watchdog = setInterval(() => {
      if (closed || userPaused) return;
      if (typeof document !== "undefined" && document.hidden) {
        lastProgressAt = Date.now();
        return;
      }
      progressed();
      catchUp();
      if (Date.now() - lastProgressAt >= 6000) retry();
    }, 1000);
    const unpaused = () => {
      userPaused = false;
      clearTimeout(reconnect);
      reconnect = undefined;
      lastProgressAt = Date.now();
    };
    const readyToSeek = () => { if (resumeAt !== undefined) metadata(); };
    video.addEventListener("durationchange", readyToSeek);
    video.addEventListener("loadeddata", readyToSeek);
    video.addEventListener("canplay", readyToSeek);
    video.addEventListener("progress", readyToSeek);
    video.addEventListener("timeupdate", progressed);
    video.addEventListener("error", retry);
    video.addEventListener("ended", ended);
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("pause", paused);
    video.addEventListener("play", unpaused);
    removeNativeListeners = () => {
      clearInterval(watchdog);
      refreshController?.abort();
      video.removeEventListener("durationchange", readyToSeek);
      video.removeEventListener("loadeddata", readyToSeek);
      video.removeEventListener("canplay", readyToSeek);
      video.removeEventListener("progress", readyToSeek);
      video.removeEventListener("timeupdate", progressed);
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
