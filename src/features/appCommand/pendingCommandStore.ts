import { storageKey } from '../../constants/brand';
import type { AppCommandCandidate, AppCommandChoice, AppCommandRoute, CommandSource } from './commandTypes';

const STORAGE_KEY = storageKey('pending-app-commands');
const MAX_PENDING_AGE_MS = 30 * 60 * 1000;
const PENDING_COMMAND_EVENT = 'sensemurmur:pending-app-command-change';

export interface PendingAppCommand {
  id: string;
  scopeKey: string;
  source: CommandSource;
  input: string;
  route: AppCommandRoute;
  secrets: Record<string, string>;
  candidates?: AppCommandCandidate[];
  choices?: AppCommandChoice[];
  createdAt: number;
}

function readAll(): PendingAppCommand[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((item): item is PendingAppCommand => (
      item
      && typeof item.id === 'string'
      && typeof item.scopeKey === 'string'
      && typeof item.input === 'string'
      && item.route
      && typeof item.createdAt === 'number'
      && now - item.createdAt < MAX_PENDING_AGE_MS
    ));
  } catch {
    return [];
  }
}

function writeAll(items: PendingAppCommand[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-20)));
  window.dispatchEvent(new CustomEvent(PENDING_COMMAND_EVENT));
}

export function savePendingAppCommand(input: Omit<PendingAppCommand, 'id' | 'createdAt'>) {
  const pending: PendingAppCommand = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const others = readAll().filter((item) => item.scopeKey !== input.scopeKey);
  writeAll([...others, pending]);
  return pending;
}

export function getPendingAppCommand(scopeKey: string) {
  return readAll().find((item) => item.scopeKey === scopeKey) || null;
}

export function clearPendingAppCommand(scopeKey: string) {
  writeAll(readAll().filter((item) => item.scopeKey !== scopeKey));
}

export function subscribePendingAppCommand(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(PENDING_COMMAND_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(PENDING_COMMAND_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function isConfirmationText(input: string) {
  const text = input.trim().toLowerCase();
  return /^(确认|确定|可以|执行|继续|开始|没问题|好|好的|yes|y|ok|okay|go|continue|confirm)\b/.test(text);
}

export function isCancellationText(input: string) {
  const text = input.trim().toLowerCase();
  return /^(取消|算了|不要|停止|先别|不执行|cancel|no|stop)\b/.test(text);
}
