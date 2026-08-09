import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageKey } from '../constants/brand';
import {
  hasPendingGuestImportForUser,
  markGuestImportSnapshotDismissed,
  type GuestImportSnapshot,
} from './guestDataImport';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
});

beforeEach(() => {
  storage.clear();
});

function snapshot(overrides: Partial<GuestImportSnapshot> = {}): GuestImportSnapshot {
  return {
    characters: [],
    chats: [],
    messageWindowsByChatId: {},
    artifacts: [],
    ...overrides,
  };
}

describe('guestDataImport prompt state', () => {
  it('remembers a dismissed snapshot per user', () => {
    const data = snapshot({
      chats: [{ id: 'chat-1', name: '本地聊天' }],
    });

    expect(hasPendingGuestImportForUser('user-a', data)).toBe(true);
    markGuestImportSnapshotDismissed('user-a', data);

    expect(hasPendingGuestImportForUser('user-a', data)).toBe(false);
    expect(hasPendingGuestImportForUser('user-b', data)).toBe(true);

    const stored = JSON.parse(localStorage.getItem(storageKey('guest-import-prompt-state')) || '{}') as {
      dismissedByUserId?: Record<string, string[]>;
    };
    expect(stored.dismissedByUserId?.['user-a']).toHaveLength(1);
  });

  it('re-prompts when the guest snapshot changes', () => {
    const first = snapshot({
      characters: [{ id: 'character-1', name: '阿青' }],
    });
    const second = snapshot({
      characters: [{ id: 'character-1', name: '阿青' }, { id: 'character-2', name: '阿离' }],
    });

    markGuestImportSnapshotDismissed('user-a', first);

    expect(hasPendingGuestImportForUser('user-a', first)).toBe(false);
    expect(hasPendingGuestImportForUser('user-a', second)).toBe(true);
  });

  it('does not prompt for empty guest snapshots', () => {
    expect(hasPendingGuestImportForUser('user-a', snapshot())).toBe(false);
  });
});
