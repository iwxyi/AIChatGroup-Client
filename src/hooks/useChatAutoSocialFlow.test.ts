import { describe, expect, it } from 'vitest';
import type { GroupChat } from '../types/chat';
import { getAutoSocialFlowDelayMs, hasPendingAutoSocialEventCandidate } from './useChatAutoSocialFlow';

function chatWithRuntimeEvents(runtimeEventsV2: GroupChat['runtimeEventsV2']): GroupChat {
  return {
    id: 'chat-1',
    type: 'group',
    runtimeEventsV2,
  } as GroupChat;
}

describe('hasPendingAutoSocialEventCandidate', () => {
  it('returns false when there are no social candidates', () => {
    expect(hasPendingAutoSocialEventCandidate(chatWithRuntimeEvents([
      { id: 'evt-1', kind: 'artifact', summary: 'published', payload: {}, createdAt: 1 },
    ] as GroupChat['runtimeEventsV2']))).toBe(false);
  });

  it('returns true for unhandled auto social candidates', () => {
    expect(hasPendingAutoSocialEventCandidate(chatWithRuntimeEvents([
      { id: 'candidate-1', kind: 'event_candidate', summary: 'candidate', payload: { eventKind: 'post_moment' }, createdAt: 1 },
    ] as GroupChat['runtimeEventsV2']))).toBe(true);
  });

  it('returns false for handled auto social candidates', () => {
    expect(hasPendingAutoSocialEventCandidate(chatWithRuntimeEvents([
      { id: 'candidate-1', kind: 'event_candidate', summary: 'candidate', payload: { eventKind: 'post_moment' }, createdAt: 1 },
      { id: 'handled-1', kind: 'artifact', summary: 'handled_social_event:candidate-1', payload: {}, createdAt: 2 },
    ] as GroupChat['runtimeEventsV2']))).toBe(false);
  });
});

describe('getAutoSocialFlowDelayMs', () => {
  it('runs pending candidates quickly', () => {
    expect(getAutoSocialFlowDelayMs(chatWithRuntimeEvents([
      { id: 'candidate-1', kind: 'event_candidate', summary: 'candidate', payload: { eventKind: 'post_moment' }, createdAt: 1 },
    ] as GroupChat['runtimeEventsV2']), 10_000)).toBe(8_000);
  });

  it('runs a low-frequency world tick after the chat has been idle long enough', () => {
    expect(getAutoSocialFlowDelayMs({
      ...chatWithRuntimeEvents([]),
      updatedAt: 10_000 - 2 * 60 * 60_000,
    } as GroupChat, 10_000)).toBe(12_000);
  });

  it('waits for the world idle window when the chat was just updated', () => {
    expect(getAutoSocialFlowDelayMs({
      ...chatWithRuntimeEvents([]),
      updatedAt: 10_000 - 30 * 60_000,
    } as GroupChat, 10_000)).toBe(90 * 60_000);
  });
});
