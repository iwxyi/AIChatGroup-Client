const PLAYBACK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedSpeech = {
  url: string;
  expiresAt: number;
};

const entries = new Map<string, CachedSpeech>();
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

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
  return entries.get(key)?.url || null;
}

export function cacheSpeechPlayback(key: string, url: string) {
  const previous = entries.get(key);
  if (previous && previous.url !== url) revoke(previous.url);
  entries.set(key, { url, expiresAt: Date.now() + PLAYBACK_CACHE_TTL_MS });
  scheduleCleanup();
  return url;
}

export function clearCachedSpeechPlayback(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  revoke(entry.url);
  scheduleCleanup();
}

export function clearAllCachedSpeechPlayback() {
  for (const entry of entries.values()) revoke(entry.url);
  entries.clear();
  scheduleCleanup();
}

export function getCachedSpeechPlaybackCount() {
  cleanupExpiredSpeechPlaybackCache();
  return entries.size;
}

export function cleanupExpiredSpeechPlaybackCache(now = Date.now()) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt > now) continue;
    entries.delete(key);
    revoke(entry.url);
  }
  scheduleCleanup();
}
