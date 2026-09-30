import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
vi.mock('../src/lib/storage', () => ({ saveCreation: vi.fn() }));
import { saveCreation } from '../src/lib/storage';
import { keepPendingCreation, pendingCreations, uploadPendingCreation, type PendingCreation } from '../src/lib/recording-outbox';
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.mocked(saveCreation).mockReset(); });
function item(): PendingCreation {
  return { meta: { id: 'stable-id', dishId: 'custom', title: 'Noodles', description: 'test', ingredients: [], createdAt: 1 }, image: new Blob(['image']), video: new Blob(['recording'], {type:'video/webm'}) };
}
it('commits real blob bytes and metadata before upload and removes only after acknowledgement', async () => {
  const creation = item();
  await keepPendingCreation(creation);
  const loaded = (await pendingCreations())[0];
  expect(await loaded.video!.text()).toBe('recording');
  expect(loaded.meta.title).toBe('Noodles');
  let done!: () => void;
  vi.mocked(saveCreation).mockReturnValue(new Promise(resolve => { done = resolve; }));
  const upload = uploadPendingCreation(loaded);
  expect(await pendingCreations()).toHaveLength(1);
  expect(uploadPendingCreation(loaded)).toBe(upload);
  done(); await upload;
  expect(saveCreation).toHaveBeenCalledOnce();
  expect(await pendingCreations()).toEqual([]);
});
it('keeps failed upload bytes with persisted retry backoff', async () => {
  const creation = item();
  await keepPendingCreation(creation);
  vi.mocked(saveCreation).mockRejectedValue(new Error('offline'));
  await expect(uploadPendingCreation(creation)).rejects.toThrow('offline');
  const loaded = (await pendingCreations())[0];
  expect(await loaded.video!.text()).toBe('recording');
  expect(loaded.attempts).toBe(1);
  expect(loaded.retryAt).toBeGreaterThan(Date.now());
});
