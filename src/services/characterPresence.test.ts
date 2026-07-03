import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../types/message';
import { applyPresenceUpdateToTransition, buildPresencePatchFromMessage, isCharacterAvailableForScheduling } from './characterPresence';

function message(patch: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    chatId: 'chat-1',
    type: 'ai',
    senderId: 'a',
    senderName: '甲',
    content: '我先去睡了。',
    emotion: 0,
    timestamp: 1,
    isDeleted: false,
    ...patch,
  };
}

describe('characterPresence', () => {
  it('builds a global away patch from model-provided presence metadata', () => {
    const patch = buildPresencePatchFromMessage({
      message: message({
        metadata: {
          presenceUpdate: {
            status: 'away',
            activity: '睡觉',
            reason: '角色明确说去睡了',
            durationMinutes: 480,
          },
        },
      }),
      now: 1_000,
    });

    expect(patch?.presence).toMatchObject({
      status: 'away',
      activity: '睡觉',
      reason: '角色明确说去睡了',
      unavailableUntil: 1_000 + 480 * 60_000,
      sourceMessageId: 'm1',
    });
  });

  it('keeps away characters out of scheduling until the away window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T14:00:00+08:00'));
    const now = Date.now();
    const character = {
      presence: {
        status: 'away' as const,
        activity: '洗澡',
        updatedAt: now,
        unavailableUntil: now + 20 * 60_000,
      },
    };

    expect(isCharacterAvailableForScheduling(character, now)).toBe(false);
    expect(isCharacterAvailableForScheduling(character, now + 21 * 60_000)).toBe(true);
    vi.useRealTimers();
  });

  it('merges presence patches into existing commit transition character patches', () => {
    const transition = applyPresenceUpdateToTransition({
      message: message({
        metadata: {
          presenceUpdate: {
            status: 'away',
            activity: '忙工作',
            reason: '角色说要先去处理工作',
            durationMinutes: 60,
          },
        },
      }),
      transition: {
        chatPatch: {},
        runtimeEvents: [],
        characterPatches: [{ characterId: 'a', patch: { speakingStyle: '短句' } }],
      },
      now: 2_000,
    });

    expect(transition.characterPatches).toHaveLength(1);
    expect(transition.characterPatches[0]).toMatchObject({
      characterId: 'a',
      patch: {
        speakingStyle: '短句',
        presence: { status: 'away', activity: '忙工作' },
      },
    });
  });
});
