const PLAYBACK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PLAYBACK_CACHE_MAX_BYTES = 160 * 1024 * 1024;

type CachedSpeech = {
  url: string;
  expiresAt: number;
  byteSize: number;
  lastAccessedAt: number;
};

const entries = new Map<string, CachedSpeech>();
const pendingDeletes = new Set<string>();
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
const DB_NAME = 'pneumata-speech-playback-cache';
const DB_VERSION = 1;
const STORE_NAME = 'speech';

type PersistedSpeech = { key: string; blob: Blob; expiresAt: number; byteSize: number; lastAccessedAt: number };

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('speech cache database unavailable'));
  });
}

async function persistSpeech(key: string, blob: Blob, expiresAt: number, byteSize: number, lastAccessedAt: number) {
  try {
    const db = await openCacheDb();
    if (!db) return;
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ key, blob, expiresAt, byteSize, lastAccessedAt } satisfies PersistedSpeech);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  } catch {
    // Memory cache remains available when IndexedDB is unavailable.
  }
}

function revoke(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function scheduleCleanup() {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  const nextExpiry = Math.min(...Array.from(entries.values(), (entry) => entry.expiresAt));
  if (!Number.isFinite(nextExpiry)) {
    cleanupTimer = null;
    return;
  }
  cleanupTimer = setTimeout(() => {
    cleanupExpiredSpeechPlaybackCache();
  }, Math.max(0, nextExpiry - Date.now()));
}

export function getCachedSpeechPlayback(key: string) {
  cleanupExpiredSpeechPlaybackCache();
  const entry = entries.get(key);
  if (!entry) return null;
  entry.lastAccessedAt = Date.now();
  return entry.url;
}

function totalCachedBytes() {
  return Array.from(entries.values()).reduce((total, entry) => total + entry.byteSize, 0);
}

function trimToCapacity(exceptKey?: string) {
  let total = totalCachedBytes();
  const candidates = Array.from(entries.entries())
    .filter(([key]) => key !== exceptKey)
    .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);
  for (const [key] of candidates) {
    if (total <= PLAYBACK_CACHE_MAX_BYTES) break;
    const entry = entries.get(key);
    if (!entry) continue;
    entries.delete(key);
    total -= entry.byteSize;
    revoke(entry.url);
    void openCacheDb().then((db) => {
      if (!db) return;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    }).catch(() => undefined);
  }
}

export function cacheSpeechPlayback(key: string, url: string, byteSize = 0, blob?: Blob) {
  pendingDeletes.delete(key);
  const previous = entries.get(key);
  if (previous && previous.url !== url) revoke(previous.url);
  const now = Date.now();
  entries.set(key, { url, expiresAt: now + PLAYBACK_CACHE_TTL_MS, byteSize: Math.max(0, byteSize), lastAccessedAt: now });
  if (blob) void persistSpeech(key, blob, now + PLAYBACK_CACHE_TTL_MS, Math.max(0, byteSize), now);
  trimToCapacity(key);
  scheduleCleanup();
  return url;
}

export function clearCachedSpeechPlayback(key: string) {
  pendingDeletes.add(key);
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  revoke(entry.url);
  void openCacheDb().then((db) => {
    if (!db) return;
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  }).catch(() => undefined);
  scheduleCleanup();
}

export function clearAllCachedSpeechPlayback() {
  for (const entry of entries.values()) revoke(entry.url);
  entries.clear();
  void openCacheDb().then((db) => {
    if (!db) return;
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  }).catch(() => undefined);
  scheduleCleanup();
}

export function getCachedSpeechPlaybackCount() {
  cleanupExpiredSpeechPlaybackCache();
  return entries.size;
}

export function getCachedSpeechPlaybackBytes() {
  cleanupExpiredSpeechPlaybackCache();
  return totalCachedBytes();
}

export function cleanupExpiredSpeechPlaybackCache(now = Date.now()) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt > now) continue;
    entries.delete(key);
    revoke(entry.url);
    void openCacheDb().then((db) => {
      if (!db) return;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    }).catch(() => undefined);
  }
  scheduleCleanup();
}

export async function hydrateCachedSpeechPlayback(key: string) {
  if (pendingDeletes.has(key)) return null;
  const inMemory = getCachedSpeechPlayback(key);
  if (inMemory) return inMemory;
  try {
    const db = await openCacheDb();
    if (!db) return null;
    const persisted = await new Promise<PersistedSpeech | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as PersistedSpeech | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!persisted) return null;
    if (persisted.expiresAt <= Date.now()) {
      clearCachedSpeechPlayback(key);
      return null;
    }
    const url = URL.createObjectURL(persisted.blob);
    const now = Date.now();
    entries.set(key, { url, expiresAt: persisted.expiresAt, byteSize: persisted.byteSize, lastAccessedAt: now });
    void persistSpeech(key, persisted.blob, persisted.expiresAt, persisted.byteSize, now);
    scheduleCleanup();
    return url;
  } catch {
    return null;
  }
}
