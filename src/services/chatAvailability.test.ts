import { describe, expect, it } from 'vitest';
import { isChatBlockedByMissingRequiredCharacters } from './chatAvailability';

const live = (id: string) => ({ id, deletedAt: null } as never);
const deleted = (id: string) => ({ id, deletedAt: Date.now() } as never);

describe('chatAvailability', () => {
  it('blocks direct and ai-direct chats when their character is deleted', () => {
    expect(isChatBlockedByMissingRequiredCharacters({ type: 'direct', memberIds: ['a'] }, [deleted('a')])).toBe(true);
    expect(isChatBlockedByMissingRequiredCharacters({ type: 'ai_direct', memberIds: ['a', 'b'] }, [live('a'), deleted('b')])).toBe(true);
  });

  it('allows a group to continue with surviving members', () => {
    expect(isChatBlockedByMissingRequiredCharacters({ type: 'group', memberIds: ['a', 'b'] }, [live('a'), deleted('b')])).toBe(false);
  });

  it('blocks a group only when every character is deleted', () => {
    expect(isChatBlockedByMissingRequiredCharacters({ type: 'group', memberIds: ['a', 'b'] }, [deleted('a'), deleted('b')])).toBe(true);
  });
});
