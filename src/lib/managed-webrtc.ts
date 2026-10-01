import { Reactor } from "@reactor-team/js-sdk";
import type { LiveConnection } from "../../shared/contracts";
import { prepareLiveAudio, type LivePlayer } from "./live";

/** Additional transport for an existing server-owned session, never a generator. */
export async function connectManagedLive(args: {
  video: HTMLVideoElement;
  getConnection: () => Promise<{ connection: LiveConnection & { expiresAt: number } }>;
  expiresAt: number;
  muted: boolean;
  audioContext?: AudioContext;
  onPlaying: () => void;
  onAudioBlocked: () => void;
  onError: () => void;
}): Promise<LivePlayer> {
  const video = args.video;
  const stream = new MediaStream();
  const context = args.audioContext ?? prepareLiveAudio();
  const gain = context?.createGain();
  gain?.connect(context!.destination);
  let muted = args.muted;
  if (gain) gain.gain.value = muted ? 0 : 1;
  let closed = false;
  let client: Reactor | undefined;
  let connecting = false;
  let deadline = args.expiresAt;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let removePeerListener: (() => void) | undefined;
  let speech: AudioBufferSourceNode | undefined;
  let speechSequence = 0;
  let failures = 0;
  video.playsInline = true;
  video.autoplay = true;
  video.muted = muted;
  // Keep this MediaStream/element intact throughout prompt changes. No HLS
  // snapshots, load(), currentTime seeks, or start commands on this path.
  video.srcObject = stream;
  const play = async () => {
    if (closed) return;
    try { await video.play(); }
    catch (error) {
      if (closed || !(error instanceof Error) || error.name !== "NotAllowedError") return;
      muted = true; video.muted = true;
      if (gain) gain.gain.value = 0;
      args.onAudioBlocked();
      await video.play().catch(() => {});
    }
  };
  const playing = () => {
    if (!closed && video.videoWidth > 0 && video.readyState >= 2) args.onPlaying();
  };
  function disposeTransport() {
    removePeerListener?.(); removePeerListener = undefined;
    const previous = client; client = undefined;
    // disconnect() ends the paid provider session, including its server recorder.
    // dispose frees only this local peer. Never substitute disconnect here.
    previous?.[Symbol.dispose]();
  }
  function schedule(delay = 2000) {
    if (closed || retry !== undefined || Date.now() >= deadline) return;
    retry = setTimeout(() => {
      retry = undefined;
      if (!document.hidden) void connect();
    }, delay);
  }
  async function connect() {
    if (closed || connecting || Date.now() >= deadline || document.hidden) return;
    connecting = true;
    try {
      const { connection } = await args.getConnection();
      if (closed) return;
      deadline = Math.min(deadline, connection.expiresAt);
      if (Date.now() >= deadline) return;
      disposeTransport();
      const next = new Reactor({
        modelName: connection.modelSlug, apiUrl: connection.apiBase,
        readyTimeoutMs: 20_000, controlRequestTimeoutMs: 10_000,
        maxSessionAttempts: 20, maxSdpAttempts: 20, logLevel: "off",
      });
      client = next;
      next.on("trackReceived", (name, track) => {
        if (closed || client !== next || !["main_video", "main_audio"].includes(name)) return;
        if (stream.getTracks().some(item => item.id === track.id)) return;
        stream.getTracks().filter(item => item.kind === track.kind).forEach(item => {
          stream.removeTrack(item); item.stop();
        });
        stream.addTrack(track);
        void play();
      });
      // Errors here affect viewing only. Backend ownership/recording survives.
      next.on("error", () => {
        if (!closed && client === next && next.getPeerConnection()?.connectionState !== "connected") schedule(3000);
      });
      await next.connect(connection.jwt, { sessionId: connection.sessionId });
      if (closed || client !== next) { next[Symbol.dispose](); return; }
      failures = 0;
      const peer = next.getPeerConnection();
      const changed = () => {
        if (peer?.connectionState === "failed") schedule();
        else if (peer?.connectionState === "disconnected") schedule(8000);
        else if (peer?.connectionState === "connected") {
          clearTimeout(retry); retry = undefined; void play();
        }
      };
      peer?.addEventListener("connectionstatechange", changed);
      removePeerListener = () => peer?.removeEventListener("connectionstatechange", changed);
      changed();
      void play();
    } catch {
      if (!closed) {
        disposeTransport();
        if (++failures === 3) args.onError();
        schedule(Math.min(5000, 1000 * failures));
      }
    } finally { connecting = false; }
  }
  const resume = (event?: Event) => {
    if (closed || document.hidden) return;
    const state = client?.getPeerConnection()?.connectionState;
    if ((event && "persisted" in event && event.persisted) || !client || state === "failed" || state === "closed" || state === "disconnected") {
      clearTimeout(retry); retry = undefined; void connect();
    } else void play();
  };
  const paused = () => {
    if (!closed && !document.hidden && !video.controls && video.getClientRects().length) void play();
  };
  // Safari can pause a video hidden by an in-app tab without a visibility event.
  // Resume its existing peer when the mounted player becomes visible again.
  const resumeTimer = setInterval(() => { if (video.paused) paused(); }, 1000);
  video.addEventListener("playing", playing);
  video.addEventListener("pause", paused);
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  void connect();
  function stopSpeech() {
    speechSequence++;
    try { speech?.stop(); } catch { /* already ended */ }
    speech?.disconnect(); speech = undefined;
  }
  return {
    async update() {}, // Ordered mutations go through Foodie's backend.
    async updateAudio() {},
    setMuted(value) {
      muted = value; video.muted = value;
      if (gain) gain.gain.value = value ? 0 : 1;
    },
    async resumeAudio() {
      if (context && context.state !== "running" && context.state !== "closed") await context.resume();
      video.muted = muted; await play(); resume();
    },
    async speak(bytes) {
      stopSpeech();
      if (closed) return;
      if (!context || !gain) throw new Error("NARRATION_UNAVAILABLE");
      const sequence = speechSequence;
      const buffer = await context.decodeAudioData(bytes.slice(0));
      if (closed || sequence !== speechSequence) return;
      if (context.state !== "running") { args.onAudioBlocked(); return; }
      speech = context.createBufferSource(); speech.buffer = buffer;
      speech.connect(gain); speech.start();
    },
    stopSpeech,
    async close() {
      if (closed) return null;
      closed = true;
      clearTimeout(retry); clearInterval(resumeTimer); disposeTransport(); stopSpeech();
      video.removeEventListener("playing", playing);
      video.removeEventListener("pause", paused);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      stream.getTracks().forEach(track => track.stop());
      if (video.srcObject === stream) { video.pause(); video.srcObject = null; }
      gain?.disconnect();
      if (context && context.state !== "closed") await context.close().catch(() => {});
      return null;
    },
  };
}
