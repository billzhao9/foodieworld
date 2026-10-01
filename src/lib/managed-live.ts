import type HlsInstance from 'hls.js';
import type { LivePlayer } from './live';
/** Viewer transport only: closing this player never sends a generation stop. */
export async function connectManagedLive(args: {
 video: HTMLVideoElement; url: string; muted: boolean;
 onPlaying: () => void; onAudioBlocked: () => void; onError: () => void;
}): Promise<LivePlayer> {
 const video = args.video;
 let closed = false;
 let hls: HlsInstance | undefined;
 let reconnect: ReturnType<typeof setTimeout> | undefined;
 let removeNativeError: (() => void) | undefined;
 let speech: HTMLAudioElement | undefined;
 let speechUrl: string | undefined;
 let soundMuted = args.muted;
 video.srcObject = null;
 video.muted = soundMuted;
 const play = async () => {
  try { await video.play(); }
  catch {
   if (closed) return;
   video.muted = true;
   args.onAudioBlocked();
   await video.play().catch(() => undefined);
  }
 };
 const playing = () => { if (!closed) args.onPlaying(); };
 video.addEventListener('playing', playing);
 if (video.canPlayType('application/vnd.apple.mpegurl')) {
  video.src = args.url;
  // A playlist may not exist until the first provider snapshot is materialized.
  const retry = () => { if (!closed) reconnect = setTimeout(() => { video.load(); void play(); }, 2000); };
  video.addEventListener('error', retry);
  video.addEventListener('loadedmetadata', () => void play(), { once: true });
  hls = undefined;
  removeNativeError = () => video.removeEventListener('error', retry);
 } else {
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) throw new Error('HLS_UNSUPPORTED');
  hls = new Hls({ lowLatencyMode: false, backBufferLength: 100, liveSyncDurationCount: 2 });
  hls.on(Hls.Events.MANIFEST_PARSED, () => void play());
  hls.on(Hls.Events.ERROR, (_event, data) => {
   if (closed || !data.fatal) return;
   if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
    reconnect = setTimeout(() => { if (!closed) hls?.loadSource(args.url); }, 2000);
   } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
   else args.onError();
  });
  hls.loadSource(args.url);
  hls.attachMedia(video);
 }
 function stopSpeech() {
  speech?.pause(); speech = undefined;
  if (speechUrl) URL.revokeObjectURL(speechUrl);
  speechUrl = undefined;
 }
 return {
  // Managed commands are delivered by the authenticated backend, never the viewer.
  async update() {}, async updateAudio() {},
  setMuted(value) { soundMuted = value; video.muted = value; if (speech) speech.muted = value; },
  async resumeAudio() { video.muted = soundMuted; await video.play(); },
  async speak(bytes) {
   stopSpeech(); if (closed) return;
   speechUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
   speech = new Audio(speechUrl); speech.muted = soundMuted;
   await speech.play();
  },
  stopSpeech,
  async close() {
   closed = true; clearTimeout(reconnect); stopSpeech(); hls?.destroy();
   removeNativeError?.(); video.removeEventListener('playing', playing);
   video.pause(); video.removeAttribute('src'); video.load(); return null;
  },
 };
}
