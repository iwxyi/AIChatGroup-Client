import { useSettingsStore } from '../stores/useSettingsStore';

export type DeveloperDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

const DIAGNOSTIC_SCOPE_STORAGE_KEY = 'miragetea:developer-diagnostic-scopes';
const DIAGNOSTIC_ENABLED_STORAGE_KEY = 'miragetea:developer-diagnostics-enabled';
const DIAGNOSTIC_BUFFER_STORAGE_KEY = 'miragetea:developer-diagnostics-buffer';
const MAX_DIAGNOSTIC_BUFFER_LENGTH = 500;

interface DeveloperDiagnosticEntry {
  at: string;
  location: string;
  level: DeveloperDiagnosticLevel;
  scope?: string;
  payload: Record<string, unknown>;
}

function safeStorage() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function isDeveloperDiagnosticsEnabled() {
  const storage = safeStorage();
  return Boolean(useSettingsStore.getState().developerMode || storage?.getItem(DIAGNOSTIC_ENABLED_STORAGE_KEY) === '1');
}

function parseDiagnosticScopes(raw: string | null) {
  return new Set((raw || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean));
}

export function isDeveloperDiagnosticScopeEnabled(scope?: string) {
  if (!isDeveloperDiagnosticsEnabled()) return false;
  if (!scope) return true;
  const storage = safeStorage();
  if (!storage) return true;
  const scopes = parseDiagnosticScopes(storage.getItem(DIAGNOSTIC_SCOPE_STORAGE_KEY));
  return scopes.size === 0 || scopes.has('*') || scopes.has(scope);
}

function readDiagnosticBuffer() {
  const storage = safeStorage();
  if (!storage) return [] as DeveloperDiagnosticEntry[];
  try {
    const raw = storage.getItem(DIAGNOSTIC_BUFFER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeveloperDiagnosticEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDiagnosticBuffer(entries: DeveloperDiagnosticEntry[]) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(DIAGNOSTIC_BUFFER_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_DIAGNOSTIC_BUFFER_LENGTH)));
  } catch {
    // ignore quota and serialization failures
  }
}

export function setDeveloperDiagnosticsEnabled(enabled: boolean) {
  const storage = safeStorage();
  if (!storage) return enabled;
  if (enabled) storage.setItem(DIAGNOSTIC_ENABLED_STORAGE_KEY, '1');
  else storage.removeItem(DIAGNOSTIC_ENABLED_STORAGE_KEY);
  return enabled;
}

export function setDeveloperDiagnosticScopes(scopes: string[]) {
  const storage = safeStorage();
  if (!storage) return scopes;
  const normalized = Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    storage.removeItem(DIAGNOSTIC_SCOPE_STORAGE_KEY);
  } else {
    storage.setItem(DIAGNOSTIC_SCOPE_STORAGE_KEY, normalized.join(','));
  }
  return normalized;
}

export function clearDeveloperDiagnostics() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(DIAGNOSTIC_BUFFER_STORAGE_KEY);
}

export function getDeveloperDiagnostics() {
  return readDiagnosticBuffer();
}

export function logDeveloperDiagnostic(
  location: string,
  payload: Record<string, unknown> = {},
  level: DeveloperDiagnosticLevel = 'debug',
  scope?: string,
) {
  if (!isDeveloperDiagnosticScopeEnabled(scope)) return;
  if (typeof console === 'undefined') return;
  const writer = console[level] || console.debug || console.log;
  if (typeof writer !== 'function') return;
  const entry = {
    at: new Date().toISOString(),
    ...payload,
  };
  writeDiagnosticBuffer([
    ...readDiagnosticBuffer(),
    {
      at: entry.at,
      location,
      level,
      scope,
      payload,
    },
  ]);
  writer.call(console, `[dev:${location}]`, entry);
}

export function measureDeveloperDiagnostic<T>(
  location: string,
  run: () => T,
  payload: Record<string, unknown> = {},
  scope?: string,
  warnThresholdMs = 16,
) {
  if (!isDeveloperDiagnosticScopeEnabled(scope) || typeof performance === 'undefined') return run();
  const startedAt = performance.now();
  try {
    return run();
  } finally {
    const durationMs = performance.now() - startedAt;
    logDeveloperDiagnostic(location, {
      ...payload,
      durationMs: Number(durationMs.toFixed(2)),
    }, durationMs >= warnThresholdMs ? 'info' : 'debug', scope);
  }
}
