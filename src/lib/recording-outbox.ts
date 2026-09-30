import type { SavedCreation } from '../../shared/contracts';
import { saveCreation } from './storage';

export interface PendingCreation {
  meta: Omit<SavedCreation, 'imageUrl' | 'hasVideo'>;
  image: Blob;
  video: Blob | null;
  cover?: Blob | null;
  attempts?: number;
  retryAt?: number;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('foodieworld-recording-outbox', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', { keyPath: 'meta.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('OUTBOX_BLOCKED'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('pending', mode);
      const request = operation(tx.objectStore('pending'));
      // Request success is not durable until the transaction commits.
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('OUTBOX_ABORTED'));
      tx.onerror = () => reject(tx.error ?? new Error('OUTBOX_FAILED'));
    });
  } finally { db.close(); }
}
export async function keepPendingCreation(item: PendingCreation): Promise<void> {
  await transaction('readwrite', store => store.put(item));
}
export async function pendingCreations(): Promise<PendingCreation[]> {
  return transaction('readonly', store => store.getAll());
}
const uploads = new Map<string, Promise<void>>();
export function uploadPendingCreation(item: PendingCreation): Promise<void> {
  const existing = uploads.get(item.meta.id);
  if (existing) return existing;
  const upload = (async () => {
    try {
      await saveCreation(item.meta, item.image, item.video, item.cover);
    } catch (error) {
      item.attempts = (item.attempts ?? 0) + 1;
      item.retryAt = Date.now() + Math.min(300_000, 30_000 * 2 ** (item.attempts - 1));
      await keepPendingCreation(item).catch(() => {});
      throw error;
    }
    // A local cleanup failure must not turn an acknowledged server save into failure.
    // Retrying the retained entry is safe: the server deduplicates by creation ID.
    await transaction('readwrite', store => store.delete(item.meta.id)).catch(() => {});
  })().finally(() => uploads.delete(item.meta.id));
  uploads.set(item.meta.id, upload);
  return upload;
}
