import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBufferedJsonStorage,
  createScopedBufferedJsonStorage,
  createScopedIndexedDbBufferedJsonStorage,
  createScopedIndexedDbStorage,
  flushBufferedPersistenceWrites,
  migrateLocalStorageFallbacksToIndexedDb,
  readIndexedDbStorageDiagnostics,
} from './storePersistenceScope';
import { clearPersistenceFailures, readPersistenceHealth } from '../services/persistenceHealth';

function createStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('storePersistenceScope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearPersistenceFailures();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('coalesces repeated buffered writes and flushes only the latest snapshot', () => {
    const rawStorage = createStorageMock();
    const storage = createBufferedJsonStorage<{ value: number }>(rawStorage, { flushDelayMs: 20 });

    storage.setItem('scope-key', { state: { value: 1 }, version: 2 });
    storage.setItem('scope-key', { state: { value: 2 }, version: 2 });

    expect(rawStorage.getItem('scope-key')).toBeNull();
    expect(storage.getItem('scope-key')).toEqual({ state: { value: 2 }, version: 2 });

    vi.advanceTimersByTime(20);

    expect(rawStorage.getItem('scope-key')).toBe(JSON.stringify({ state: { value: 2 }, version: 2 }));
  });

  it('flushes buffered persistence immediately for manual retry', () => {
    const rawStorage = createStorageMock();
    const storage = createBufferedJsonStorage<{ value: number }>(rawStorage, { flushDelayMs: 10_000 });

    storage.setItem('retry-scope', { state: { value: 7 }, version: 2 });
    expect(rawStorage.getItem('retry-scope')).toBeNull();

    flushBufferedPersistenceWrites();

    expect(rawStorage.getItem('retry-scope')).toBe(JSON.stringify({ state: { value: 7 }, version: 2 }));
  });

  it('isolates buffered writes by scoped storage key while accounts switch', () => {
    const rawStorage = createStorageMock();
    vi.stubGlobal('localStorage', rawStorage);
    let currentScope = 'scoped-chats-user-a';
    const storage = createScopedBufferedJsonStorage<{ value: string }>({
      getScopedKey: () => currentScope,
      storageName: 'scoped-chats',
      flushDelayMs: 10_000,
    });

    storage.setItem('scoped-chats', { state: { value: 'user-a' }, version: 2 });
    currentScope = 'scoped-chats-user-b';
    storage.setItem('scoped-chats', { state: { value: 'user-b' }, version: 2 });

    expect(storage.getItem('scoped-chats')).toEqual({ state: { value: 'user-b' }, version: 2 });
    currentScope = 'scoped-chats-user-a';
    expect(storage.getItem('scoped-chats')).toEqual({ state: { value: 'user-a' }, version: 2 });

    flushBufferedPersistenceWrites();

    expect(rawStorage.getItem('scoped-chats-user-a')).toBe(JSON.stringify({ state: { value: 'user-a' }, version: 2 }));
    expect(rawStorage.getItem('scoped-chats-user-b')).toBe(JSON.stringify({ state: { value: 'user-b' }, version: 2 }));
  });

  it('records quota failures instead of hiding local persistence loss', () => {
    const rawStorage = createStorageMock();
    rawStorage.setItem = vi.fn(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createBufferedJsonStorage<{ value: string }>(rawStorage, { flushDelayMs: 20 });

    storage.setItem('large-scope', { state: { value: 'x'.repeat(256) }, version: 2 });
    vi.advanceTimersByTime(20);

    const health = readPersistenceHealth();
    expect(health.latestFailure).toMatchObject({
      name: 'large-scope',
      reason: 'quota_exceeded',
    });
    expect(health.latestFailure?.sizeBytes).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });

  it('keeps localStorage fallback when IndexedDB is unavailable', async () => {
    const rawStorage = createStorageMock();
    vi.stubGlobal('localStorage', rawStorage);
    vi.stubGlobal('indexedDB', undefined);
    rawStorage.setItem('scoped-messages-user-1', 'legacy-cache');
    const storage = createScopedIndexedDbStorage({
      getScopedKey: () => 'scoped-messages-user-1',
      storageName: 'scoped-messages',
    });

    await expect(storage.getItem('scoped-messages')).resolves.toBe('legacy-cache');
    await storage.setItem('scoped-messages', 'next-cache');

    expect(rawStorage.getItem('scoped-messages-user-1')).toBe('next-cache');
  });

  it('prefers localStorage fallback for buffered IndexedDB storage hydration', async () => {
    const rawStorage = createStorageMock();
    vi.stubGlobal('localStorage', rawStorage);
    const indexedOpen = vi.fn();
    vi.stubGlobal('indexedDB', { open: indexedOpen });
    rawStorage.setItem('scoped-chats-user-1', JSON.stringify({ state: { value: 'local' }, version: 5 }));
    const storage = createScopedIndexedDbBufferedJsonStorage<{ value: string }>({
      getScopedKey: () => 'scoped-chats-user-1',
      storageName: 'scoped-chats',
    });

    await expect(storage.getItem('scoped-chats')).resolves.toEqual({ state: { value: 'local' }, version: 5 });
    expect(indexedOpen).not.toHaveBeenCalled();
  });

  it('times out blocked IndexedDB reads so store hydration cannot hang forever', async () => {
    const rawStorage = createStorageMock();
    vi.stubGlobal('localStorage', rawStorage);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => ({})),
    });
    const storage = createScopedIndexedDbBufferedJsonStorage<{ value: string }>({
      getScopedKey: () => 'blocked-chats-user-1',
      storageName: 'blocked-chats',
    });

    const resultPromise = storage.getItem('blocked-chats');
    await vi.advanceTimersByTimeAsync(2400);

    await expect(resultPromise).resolves.toBeNull();
    expect(readPersistenceHealth().latestFailure).toMatchObject({
      name: 'blocked-chats-user-1',
      reason: 'read_failed',
    });
    warnSpy.mockRestore();
  });

  it('reopens IndexedDB and retries once after a stale connection read timeout', async () => {
    const rawStorage = createStorageMock();
    vi.stubGlobal('localStorage', rawStorage);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let openCount = 0;
    let readCount = 0;
    const database = {
      close: vi.fn(),
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            const request = {} as IDBRequest<string>;
            readCount += 1;
            if (readCount > 1) {
              queueMicrotask(() => {
                Object.defineProperty(request, 'result', { value: JSON.stringify({ state: 'retried-value', version: 5 }) });
                request.onsuccess?.(new Event('success'));
              });
            }
            return request;
          },
        }),
      }),
    } as unknown as IDBDatabase;
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        openCount += 1;
        const request = {} as IDBOpenDBRequest;
        Object.defineProperty(request, 'result', { value: database });
        queueMicrotask(() => request.onsuccess?.(new Event('success')));
        return request;
      }),
    });
    const storage = createScopedIndexedDbBufferedJsonStorage<string>({
      getScopedKey: () => 'retry-messages-user-1',
      storageName: 'retry-messages',
    });

    const resultPromise = storage.getItem('retry-messages');
    await vi.advanceTimersByTimeAsync(1200);
    await vi.advanceTimersByTimeAsync(0);

    await expect(resultPromise).resolves.toEqual({ state: 'retried-value', version: 5 });
    expect(openCount).toBe(2);
    expect(database.close).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('returns explicit IndexedDB diagnostics when storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);

    await expect(readIndexedDbStorageDiagnostics()).resolves.toMatchObject({
      available: false,
      databaseName: 'pneumata-local-store',
      objectStoreName: 'kv',
      totalBytes: 0,
      largest: [],
    });
  });

  it('does not remove localStorage fallback when IndexedDB migration cannot run', async () => {
    const rawStorage = createStorageMock();
    vi.stubGlobal('localStorage', rawStorage);
    vi.stubGlobal('indexedDB', undefined);
    rawStorage.setItem('scoped-chats-user-1', 'legacy-cache');

    await expect(migrateLocalStorageFallbacksToIndexedDb(['scoped-chats-user-1'])).resolves.toMatchObject({
      migrated: 0,
      removed: 0,
      skipped: 1,
      failed: 0,
    });
    expect(rawStorage.getItem('scoped-chats-user-1')).toBe('legacy-cache');
  });
});
