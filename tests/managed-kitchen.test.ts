import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ unmount: undefined as (() => void) | undefined, close: vi.fn(), archived: false, ended: false }));
vi.mock('vue', async original => ({ ...(await original<typeof import('vue')>()), onMounted: vi.fn(), onUnmounted: (callback: () => void) => { mocks.unmount = callback; } }));
vi.mock('../src/i18n', async () => ({ locale: (await import('vue')).ref('zh') }));
vi.mock('../src/lib/live', () => ({ connectLive: vi.fn(), prepareLiveAudio: vi.fn(), recordingSupported: () => true }));
vi.mock('../src/lib/managed-webrtc', () => ({ connectManagedLive: vi.fn(async (options: { onPlaying: () => void }) => {
 options.onPlaying(); return { close: mocks.close, update: vi.fn(), updateAudio: vi.fn(), speak: vi.fn(), stopSpeech: vi.fn(), setMuted: vi.fn(), resumeAudio: vi.fn() };
}) }));
vi.mock('../src/lib/storage', () => ({ listCreations: vi.fn().mockResolvedValue([]), getVideo: vi.fn(), getImage: vi.fn() }));
import { useKitchen } from '../src/useKitchen';
import { connectManagedLive } from '../src/lib/managed-webrtc';
import { connectLive, prepareLiveAudio } from '../src/lib/live';
const opening = { title: '汤', titleEn: 'Soup', description: '香', descriptionEn: 'Tasty', imagePrompt: 'A warm bowl of soup', videoPrompt: 'Soup steams on the table' };
beforeEach(() => {
 vi.useFakeTimers(); vi.clearAllMocks(); mocks.archived = false; mocks.ended = false; mocks.close.mockResolvedValue(null);
 vi.stubGlobal('document', { removeEventListener: vi.fn() });
 vi.stubGlobal('window', { removeEventListener: vi.fn() });
 vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: () => null });
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (url.endsWith('/image') || url.endsWith('/narration')) return new Response(new Blob(['media']));
  if (url.endsWith('/prepare')) return Response.json({ opening, imageUrl: '/image' });
  if (url.endsWith('/live')) return Response.json({ managed: true, id: 'managed', expiresAt: Date.now() + 90000, playbackUrl: '/stream/index.m3u8', status: 'running' });
  if (url === '/api/live/managed') return Response.json({ session: { managed: true, id: 'managed', expiresAt: Date.now() + 90000, status: mocks.archived || mocks.ended ? 'ended' : 'running', recordingStatus: mocks.archived ? 'playable' : 'capturing', commands: [], ...(mocks.archived ? { creationId: 'saved-server' } : {}) } });
  return Response.json({});
 }));
});
afterEach(() => { mocks.unmount?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function begin() {
 const kitchen = useKitchen(); kitchen.videoElement.value = { muted: false } as HTMLVideoElement;
 kitchen.selectIngredients(['番茄']); await kitchen.start(); return kitchen;
}
it('unmount detaches the viewer without stopping a server-owned paid round', async () => {
 const kitchen = await begin(); expect(kitchen.stage.value).toBe('live');
 mocks.unmount?.();
 expect(mocks.close).toHaveBeenCalled();
 expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/stop'))).toBe(false);
 expect(connectLive).not.toHaveBeenCalled();
});
it('discovers the server archive without uploading or requiring a browser recording', async () => {
 const kitchen = await begin(); mocks.archived = true;
 await vi.advanceTimersByTimeAsync(2100);
 expect(kitchen.saved.value).toBe(true);
 expect(kitchen.recordingDownloadUrl.value).toContain('/creations/saved-server/video');
 expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).includes('/creations') && init?.method === 'POST')).toBe(false);
});

it('waits for a queued admission before attaching a viewer and preserves the unlocked audio context', async () => {
 const audio = { state: 'running', close: vi.fn() } as unknown as AudioContext;
 vi.mocked(prepareLiveAudio).mockReturnValueOnce(audio);
 const original = vi.mocked(fetch).getMockImplementation()!;
 vi.mocked(fetch).mockImplementation(async (url, init) => {
  if (String(url).endsWith('/live')) return Response.json({ managed: true, id: 'managed', expiresAt: Date.now() + 90000, playbackUrl: '', status: 'queued' });
  if (url === '/api/live/managed') return Response.json({ session: { managed: true, id: 'managed', expiresAt: Date.now() + 90000, playbackUrl: '/stream/index.m3u8', status: 'running', recordingStatus: 'capturing', commands: [] } });
  return original(url, init);
 });
 const kitchen = await begin();
 expect(connectManagedLive).not.toHaveBeenCalled();
 expect(audio.close).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(2100);
 expect(connectManagedLive).toHaveBeenCalledWith(expect.objectContaining({ audioContext: audio, getConnection: expect.any(Function) }));
 expect(kitchen.stage.value).toBe('live');
});

it('closes the live viewer before assigning the saved replay source', async () => {
 const kitchen = await begin();
 mocks.close.mockImplementation(async () => {
  expect(kitchen.recordingUrl.value).toBe('');
 });
 mocks.archived = true;
 await vi.advanceTimersByTimeAsync(2100);
 expect(kitchen.recordingUrl.value).toContain('/saved-server/video');
});
it('does not report a missing browser recording when stopping an already archived managed round', async () => {
 const kitchen = await begin(); mocks.archived = true;
 await vi.advanceTimersByTimeAsync(2100);
 expect(kitchen.saved.value).toBe(true);
 await kitchen.stop();
 expect(kitchen.saveState.value).toBe('saved');
 expect(kitchen.error.value).not.toContain('浏览器未交付录像');
});

it('closes the viewer when generation ends, before the archive becomes playable', async () => {
 const kitchen = await begin(); mocks.ended = true;
 await vi.advanceTimersByTimeAsync(2100);
 expect(mocks.close).toHaveBeenCalledTimes(1);
 expect(kitchen.stage.value).toBe('stopped');
 expect(kitchen.saveState.value).toBe('saving');
 expect(connectManagedLive).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(6000);
 expect(connectManagedLive).toHaveBeenCalledTimes(1);
 mocks.archived = true; await vi.advanceTimersByTimeAsync(2100);
 expect(kitchen.saved.value).toBe(true);
 expect(mocks.close).toHaveBeenCalledTimes(1);
});
