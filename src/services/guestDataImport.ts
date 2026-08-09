import { scopedStorageKey, storageKey } from '../constants/brand';
import { getLocalDataUserId } from './authStorageScope';
import { createScopedIndexedDbStorage, flushBufferedPersistenceWrites } from '../stores/storePersistenceScope';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useChatStore } from '../stores/useChatStore';
import { useMessageStore } from '../stores/useMessageStore';
import { useCharacterArtifactStore } from '../stores/useCharacterArtifactStore';
import { runWithCloudSyncBootstrapLock } from './cloudSyncBootstrapLock';
import { isCloudSyncEnabled } from './cloudSyncPreference';

type PersistedState<T> = { state?: T };

export interface GuestImportSnapshot {
  characters: unknown[];
  chats: unknown[];
  messageWindowsByChatId: Record<string, unknown>;
  artifacts: unknown[];
}

interface GuestImportPromptState {
  version: 1;
  dismissedByUserId: Record<string, string[]>;
}

const PROMPT_STATE_KEY = storageKey('guest-import-prompt-state');
const MAX_DISMISSED_SIGNATURES_PER_USER = 20;

function scopedStorage(scopedKey: string, storageName: string) {
  return createScopedIndexedDbStorage({
    getScopedKey: () => scopedKey,
    storageName,
  });
}

async function readPersistedState<T>(scopedKey: string, storageName: string): Promise<T | null> {
  try {
    const raw = await scopedStorage(scopedKey, storageName).getItem(storageName);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState<T>;
    return parsed.state || null;
  } catch {
    return null;
  }
}

async function removePersistedState(scopedKey: string, storageName: string) {
  await scopedStorage(scopedKey, storageName).removeItem(storageName);
}

function mergeById<T>(current: T[], incoming: T[], getId: (item: T) => string | null) {
  const byId = new Map<string, T>();
  for (const item of current) {
    const id = getId(item);
    if (id) byId.set(id, item);
  }
  const next = [...current];
  for (const item of incoming) {
    const id = getId(item);
    if (!id || byId.has(id)) continue;
    byId.set(id, item);
    next.push(item);
  }
  return next;
}

function mergeMessageWindows(
  current: Record<string, { messages?: Array<{ id?: string }> }>,
  incoming: Record<string, { messages?: Array<{ id?: string }> }>,
) {
  const next = { ...current };
  for (const [chatId, guestWindow] of Object.entries(incoming)) {
    const currentWindow = next[chatId] || {};
    next[chatId] = {
      ...guestWindow,
      ...currentWindow,
      messages: mergeById(currentWindow.messages || [], guestWindow.messages || [], (item) => item.id || null),
    };
  }
  return next;
}

export async function readGuestImportSnapshot(): Promise<GuestImportSnapshot> {
  const [characterState, chatState, messageState, artifactState] = await Promise.all([
    readPersistedState<{ characters?: unknown[] }>(scopedStorageKey('characters-guest'), scopedStorageKey('characters')),
    readPersistedState<{ chats?: unknown[] }>(scopedStorageKey('chats-guest'), scopedStorageKey('chats')),
    readPersistedState<{ messageWindowsByChatId?: Record<string, unknown> }>(scopedStorageKey('messages-guest'), scopedStorageKey('messages')),
    readPersistedState<{ items?: unknown[] }>(scopedStorageKey('character-artifacts-guest'), scopedStorageKey('character-artifacts')),
  ]);
  return {
    characters: Array.isArray(characterState?.characters) ? characterState.characters : [],
    chats: Array.isArray(chatState?.chats) ? chatState.chats : [],
    messageWindowsByChatId: messageState?.messageWindowsByChatId && typeof messageState.messageWindowsByChatId === 'object'
      ? messageState.messageWindowsByChatId
      : {},
    artifacts: Array.isArray(artifactState?.items) ? artifactState.items : [],
  };
}

export function hasGuestImportData(snapshot: GuestImportSnapshot) {
  return snapshot.characters.length > 0
    || snapshot.chats.length > 0
    || Object.values(snapshot.messageWindowsByChatId).some((value) => {
      const messages = (value as { messages?: unknown[] } | null | undefined)?.messages;
      return Array.isArray(messages) && messages.length > 0;
    })
    || snapshot.artifacts.length > 0;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function getGuestImportSnapshotSignature(snapshot: GuestImportSnapshot) {
  const payload = stableStringify(snapshot);
  return `v1:${hashString(payload)}:${payload.length.toString(36)}`;
}

function readPromptState(): GuestImportPromptState {
  if (typeof localStorage === 'undefined') {
    return { version: 1, dismissedByUserId: {} };
  }
  try {
    const raw = localStorage.getItem(PROMPT_STATE_KEY);
    if (!raw) return { version: 1, dismissedByUserId: {} };
    const parsed = JSON.parse(raw) as Partial<GuestImportPromptState>;
    return {
      version: 1,
      dismissedByUserId: parsed.dismissedByUserId && typeof parsed.dismissedByUserId === 'object'
        ? parsed.dismissedByUserId
        : {},
    };
  } catch {
    return { version: 1, dismissedByUserId: {} };
  }
}

function writePromptState(state: GuestImportPromptState) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROMPT_STATE_KEY, JSON.stringify(state));
  } catch {
    // The prompt can safely fall back to appearing again if persistent storage is unavailable.
  }
}

export function hasDismissedGuestImportSnapshot(userId: string, snapshot: GuestImportSnapshot) {
  const signature = getGuestImportSnapshotSignature(snapshot);
  return readPromptState().dismissedByUserId[userId]?.includes(signature) === true;
}

export function markGuestImportSnapshotDismissed(userId: string, snapshot: GuestImportSnapshot) {
  const signature = getGuestImportSnapshotSignature(snapshot);
  const state = readPromptState();
  const current = state.dismissedByUserId[userId] || [];
  state.dismissedByUserId[userId] = [
    signature,
    ...current.filter((item) => item !== signature),
  ].slice(0, MAX_DISMISSED_SIGNATURES_PER_USER);
  writePromptState(state);
}

export function hasPendingGuestImportForUser(userId: string, snapshot: GuestImportSnapshot) {
  return hasGuestImportData(snapshot) && !hasDismissedGuestImportSnapshot(userId, snapshot);
}

export async function importGuestDataToCurrentAccount(snapshot: GuestImportSnapshot) {
  await runWithCloudSyncBootstrapLock(async () => {
    const currentUserId = getLocalDataUserId();
    if (!currentUserId || currentUserId === 'guest') return;
    await Promise.allSettled([
      useCharacterStore.persist.rehydrate(),
      useChatStore.persist.rehydrate(),
      useMessageStore.persist.rehydrate(),
      useCharacterArtifactStore.persist.rehydrate(),
    ]);
    useCharacterStore.setState((state) => ({
      characters: mergeById(state.characters, snapshot.characters as typeof state.characters, (item) => item.id || null),
    }));
    useChatStore.setState((state) => ({
      chats: mergeById(state.chats, snapshot.chats as typeof state.chats, (item) => item.id || null),
    }));
    useMessageStore.setState((state) => ({
      messageWindowsByChatId: mergeMessageWindows(
        state.messageWindowsByChatId as Record<string, { messages?: Array<{ id?: string }> }>,
        snapshot.messageWindowsByChatId as Record<string, { messages?: Array<{ id?: string }> }>,
      ) as typeof state.messageWindowsByChatId,
    }));
    useCharacterArtifactStore.setState((state) => ({
      items: mergeById(state.items, snapshot.artifacts as typeof state.items, (item) => item.id || null),
    }));
    flushBufferedPersistenceWrites();
    await Promise.allSettled([
      removePersistedState(scopedStorageKey('characters-guest'), scopedStorageKey('characters')),
      removePersistedState(scopedStorageKey('chats-guest'), scopedStorageKey('chats')),
      removePersistedState(scopedStorageKey('messages-guest'), scopedStorageKey('messages')),
      removePersistedState(scopedStorageKey('character-artifacts-guest'), scopedStorageKey('character-artifacts')),
    ]);
  });
  if (isCloudSyncEnabled()) {
    const importedCharacters = snapshot.characters
      .filter((item): item is { id: string; isPreset?: boolean; deletedAt?: number | null } => (
        typeof (item as { id?: unknown })?.id === 'string'
        && !(item as { isPreset?: boolean }).isPreset
        && (item as { deletedAt?: number | null }).deletedAt == null
      ));
    const importedChats = snapshot.chats
      .filter((item): item is { id: string; deletedAt?: number | null } => (
        typeof (item as { id?: unknown })?.id === 'string'
        && (item as { deletedAt?: number | null }).deletedAt == null
      ));
    for (const character of importedCharacters) {
      await useCharacterStore.getState().syncPatch(character.id, character, 'create');
    }
    for (const chat of importedChats) {
      await useChatStore.getState().syncPatch(chat.id, chat, 'create');
    }
    useCharacterStore.getState().resumeSync();
    useChatStore.getState().resumeSync();
  }
}
