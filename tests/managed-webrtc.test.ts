import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const clients = vi.hoisted(() => [] as Array<{ connect: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; sendCommand: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; handlers: Record<string, (...args: unknown[]) => void>; peer: EventTarget & { connectionState: string } }>);
vi.mock('@reactor-team/js-sdk', () => ({ Reactor: class {
  handlers: Record<string, (...args: unknown[]) => void> = {};
  peer = Object.assign(new EventTarget(), { connectionState: 'connected' });
  connect = vi.fn(async () => {}); dispose = vi.fn(); disconnect = vi.fn(); sendCommand = vi.fn();
  constructor() { clients.push(this); }
  on(name: string, fn: (...args: unknown[]) => void) { this.handlers[name] = fn; }
  getPeerConnection() { return this.peer; }
  [Symbol.dispose]() { this.dispose(); }
} }));
vi.mock('../src/lib/live', () => ({ prepareLiveAudio: () => undefined }));
import { connectManagedLive } from '../src/lib/managed-webrtc';
class Stream {
  tracks: MediaStreamTrack[] = [];
  getTracks() { return this.tracks; }
  addTrack(track: MediaStreamTrack) { this.tracks.push(track); }
  removeTrack(track: MediaStreamTrack) { this.tracks = this.tracks.filter(t => t !== track); }
}
class Video extends EventTarget {
  srcObject: unknown = null; videoWidth = 1920; readyState = 4; controls = false;
  paused = false; visible = true;
  getClientRects() { return this.visible ? [{}] : []; }
  play = vi.fn(async () => {}); pause = vi.fn(); load = vi.fn();
}
let doc: EventTarget & { hidden: boolean };
beforeEach(() => {
  clients.length = 0; vi.useFakeTimers();
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('MediaStream', Stream);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function fixture() {
 const video = new Video();
 const connection = { protocol: 'webrtc' as const, sessionId: 'same-paid-session', jwt: 'scoped', apiBase: 'https://api.reactor.inc', modelSlug: 'orbis', expiresAt: Date.now()+90_000 };
 const getConnection = vi.fn(async () => ({ connection }));
 const player = await connectManagedLive({ video: video as unknown as HTMLVideoElement, getConnection, expiresAt: connection.expiresAt, muted: true, onPlaying: vi.fn(), onAudioBlocked: vi.fn(), onError: vi.fn() });
 await vi.advanceTimersByTimeAsync(0);
 return { video, player, getConnection };
}
it('joins the same session without starting generation or resetting the video for additions', async () => {
 const { video, player } = await fixture(); const client = clients[0], stream = video.srcObject;
 expect(client.connect).toHaveBeenCalledWith('scoped', { sessionId: 'same-paid-session' });
 const track = { id: 'v', kind: 'video', stop: vi.fn() };
 client.handlers.trackReceived('main_video', track);
 await player.update('Add a turtle', ''); await player.update('Add cheese', '');
 client.handlers.error(new Error('command event'));
 await vi.advanceTimersByTimeAsync(4000);
 expect(clients).toHaveLength(1); expect(video.srcObject).toBe(stream);
 expect(video.load).not.toHaveBeenCalled(); expect(client.sendCommand).not.toHaveBeenCalled();
 await player.close(); await player.close();
 expect(client.dispose).toHaveBeenCalledTimes(1); expect(client.disconnect).not.toHaveBeenCalled();
 expect(track.stop).toHaveBeenCalledTimes(1);
});
it('recovers only the viewer after transport failure and stops retries after close', async () => {
 const { player, getConnection, video } = await fixture(); const stream = video.srcObject;
 clients[0].peer.connectionState = 'failed'; clients[0].peer.dispatchEvent(new Event('connectionstatechange'));
 await vi.advanceTimersByTimeAsync(2100);
 expect(getConnection).toHaveBeenCalledTimes(2); expect(clients[0].dispose).toHaveBeenCalled();
 expect(clients[1].connect).toHaveBeenCalledWith('scoped', { sessionId: 'same-paid-session' });
 expect(video.srcObject).toBe(stream); expect(video.load).not.toHaveBeenCalled();
 await player.close(); await vi.advanceTimersByTimeAsync(10000);
 expect(getConnection).toHaveBeenCalledTimes(2);
 for (const c of clients) expect(c.disconnect).not.toHaveBeenCalled();
});
it('backgrounding never sends a stop and return resumes the existing healthy peer', async () => {
 const { player, getConnection, video } = await fixture();
 doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(10000);
 expect(clients[0].dispose).not.toHaveBeenCalled();
 doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(0);
 expect(getConnection).toHaveBeenCalledTimes(1); expect(video.play).toHaveBeenCalled();
 await player.close();
});
it('never retries beyond the paid deadline', async () => {
 const { player, getConnection } = await fixture();
 await vi.advanceTimersByTimeAsync(91_000);
 clients[0].peer.connectionState = 'failed'; clients[0].peer.dispatchEvent(new Event('connectionstatechange'));
 await vi.advanceTimersByTimeAsync(10000);
 expect(getConnection).toHaveBeenCalledTimes(1); await player.close();
});

it('resumes a video paused by hiding an in-app tab without reconnecting or loading', async () => {
 const { player, video, getConnection } = await fixture();
 video.play.mockClear(); video.visible = false; video.paused = true;
 video.dispatchEvent(new Event('pause')); await vi.advanceTimersByTimeAsync(2000);
 expect(video.play).not.toHaveBeenCalled();
 video.visible = true; await vi.advanceTimersByTimeAsync(1000);
 expect(video.play).toHaveBeenCalledTimes(1); expect(getConnection).toHaveBeenCalledTimes(1);
 expect(video.load).not.toHaveBeenCalled(); await player.close();
});
