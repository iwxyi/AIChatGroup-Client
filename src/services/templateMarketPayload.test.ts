import { describe, expect, it } from 'vitest';
import { buildBundleMarketPayload, buildCharacterMarketPayload, buildChatMarketPayload } from './templateMarketPayload';
import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';

function characterFixture(id: string, name: string): AICharacter {
  return {
    id,
    name,
    avatar: '',
    personality: {},
    behavior: {},
    expertise: [],
    speakingStyle: '',
    background: '',
    relationships: [
      { characterId: 'member-b', affinity: 10, trust: 5, respect: 3, tension: 0 },
      { characterId: 'outsider', affinity: -10, trust: -5, respect: 0, tension: 8 },
    ],
    memory: {
      longTerm: ['inside memory'],
      shortTermSummary: 'summary',
      secrets: ['secret'],
      obsessions: [],
      tabooTopics: [],
      userMemories: [],
    },
    layeredMemories: [{ id: 'memory-1', text: 'layered memory', createdAt: 1 }],
    runtimeTimeline: [{ id: 'timeline-1', content: 'timeline', createdAt: 1 }],
    isPreset: false,
    createdAt: 1,
    updatedAt: 1,
  } as unknown as AICharacter;
}

function chatFixture(): GroupChat {
  return {
    id: 'chat-1',
    name: '测试聊天',
    topic: '市场测试',
    style: 'free',
    memberIds: ['member-a', 'member-b'],
    sourceMemberIds: ['member-a', 'member-b'],
    isActive: true,
    allowIntervention: true,
    speed: 'normal',
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    relationshipLedger: [
      { actorId: 'member-a', targetId: 'member-b', affinity: 8 },
      { actorId: 'member-a', targetId: 'outsider', affinity: -8 },
    ],
    runtimeEventsV2: [
      { id: 'event-inside', type: 'test', createdAt: 1, actorIds: ['member-a'], targetIds: ['member-b'], payload: { participantIds: ['member-a', 'member-b'] } },
      { id: 'event-outside', type: 'test', createdAt: 1, actorIds: ['member-a'], targetIds: ['outsider'], payload: { participantIds: ['member-a', 'outsider'] } },
    ],
  } as unknown as GroupChat;
}

describe('template market payload builders', () => {
  it('exports character templates without runtime memory or relationship state', () => {
    const payload = buildCharacterMarketPayload(characterFixture('member-a', '角色 A'));
    const template = payload.character as Record<string, unknown>;

    expect(template.name).toBe('角色 A');
    expect(template.avatar).toBe('');
    expect(template).not.toHaveProperty('relationships');
    expect(template).not.toHaveProperty('memory');
    expect(template).not.toHaveProperty('layeredMemories');
    expect(template).not.toHaveProperty('runtimeTimeline');
  });

  it('exports chat templates without bundled members', () => {
    const payload = buildChatMarketPayload(chatFixture());

    expect(payload.chat.memberIds).toEqual([]);
    expect(payload.chat.sourceMemberIds).toEqual([]);
  });

  it('keeps bundle state scoped to chat members only', () => {
    const payload = buildBundleMarketPayload(chatFixture(), [
      characterFixture('member-a', '角色 A'),
      characterFixture('member-b', '角色 B'),
      characterFixture('outsider', '群外角色'),
    ]);

    expect(payload.characters.map((entry) => entry.localId)).toEqual(['member-a', 'member-b']);
    expect(payload.chat.relationshipLedger).toEqual([
      expect.objectContaining({ actorId: 'member-a', targetId: 'member-b' }),
    ]);
    expect(payload.chat.runtimeEventsV2).toEqual([
      expect.objectContaining({ id: 'event-inside' }),
    ]);
    expect(payload.characters[0].template.relationships).toEqual([
      expect.objectContaining({ characterId: 'member-b' }),
    ]);
  });
});
