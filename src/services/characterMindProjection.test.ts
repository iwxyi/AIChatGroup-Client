import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_BEHAVIOR, DEFAULT_EMOTIONAL_STATE, type AICharacter } from '../types/character';
import { normalizeConversation } from '../types/chat';
import type { Message } from '../types/message';
import { buildCharacterMindProjection, buildCharacterMindProjectionPromptBlock } from './characterMindProjection';

function character(overrides: Partial<AICharacter> = {}): AICharacter {
  return {
    id: 'char-a',
    name: '苏苏',
    avatar: '',
    personality: { openness: 50, extroversion: 50, agreeableness: 65, neuroticism: 45, humor: 50, creativity: 50, assertiveness: 42, empathy: 72 },
    emotionalState: DEFAULT_EMOTIONAL_STATE,
    relationships: [],
    layeredMemories: [],
    background: '一个会记住共同经历的陪伴角色。',
    speakingStyle: '说话自然、克制，偶尔嘴硬。',
    expertise: [],
    coreProfile: {
      coreDesire: '希望被理解',
      coreFear: '被轻易忘记',
      valuePriority: ['关系中的诚实'],
      interactionHabits: ['先观察，再接话'],
      hiddenSoftSpots: ['用户认真回应时会放松'],
    },
    group: '',
    behavior: DEFAULT_CHARACTER_BEHAVIOR,
    memory: {
      shortTermSummary: '',
      longTerm: [],
      secrets: [],
      obsessions: [],
      tabooTopics: [],
      userMemories: ['用户不喜欢太甜的饮料。'],
    },
    intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
    createdAt: 1,
    updatedAt: 1,
    isPreset: false,
    ...overrides,
  };
}

function message(content: string, senderId = 'user'): Message {
  return {
    id: `m-${content}`,
    chatId: 'chat-1',
    type: senderId === 'user' ? 'user' : 'ai',
    senderId,
    senderName: senderId === 'user' ? '用户' : '小铁',
    content,
    emotion: 0,
    timestamp: 1000,
    isDeleted: false,
  };
}

function chat(type: 'direct' | 'group' = 'direct') {
  return normalizeConversation({
    id: 'chat-1',
    type,
    mode: 'open_chat',
    modeConfig: { freeSpeaking: true, allowInterruptions: true, allowPrivateThreads: true, allowDirectorInterventions: true, showRoleActions: true },
    modeState: { phase: 'free', currentSpeakerId: null, currentTopicFocus: '', lastRelationshipEventAt: null },
    name: type === 'direct' ? '私聊' : '群聊',
    topic: '今晚喝什么',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: type === 'direct' ? ['char-a'] : ['char-a', 'char-b'],
    speed: 1,
    isActive: false,
    allowIntervention: true,
    topicSeed: '',
    governance: { ownerCharacterId: null, adminCharacterIds: [], autoModeration: false, allowMute: true, allowPrivateThreads: true },
    dramaRules: { allowCliques: false, allowMockery: false, allowAlliances: true, allowContempt: false },
    worldState: {
      phase: 'idle',
      mood: '',
      focus: '',
      recentEvent: '',
      conflictAxes: [],
      structuredRoomState: {
        heat: 72,
        cohesion: 30,
        topicDrift: 12,
        dominantThread: ['char-a', 'char-b'],
        pileOnTarget: 'char-b',
        alliances: [['char-a', 'char-b']],
        conflictPairs: [],
      },
    },
    directorControls: { allowSpeakAs: true, allowDirectorMode: true, allowEventInjection: true, allowForcedReply: true },
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
  });
}

describe('characterMindProjection', () => {
  it('keeps persistent user continuity available without current-chat profile events', () => {
    const speaker = character({
      relationships: [{ characterId: 'user', warmth: 24, competence: 0, trust: 30, threat: 4, note: '愿意照顾用户，但不喜欢被强迫表态。' }],
      soulState: {
        mood: { pleasure: 50, arousal: 40, dominance: 40 },
        energy: 72,
        attention: 65,
        loneliness: 20,
        repression: 20,
        shame: 10,
        envy: 0,
        trustInRoom: 60,
        ignoredStreak: 0,
        lastImpulse: 'comfort',
        updatedAt: 1,
      },
    });
    const projection = buildCharacterMindProjection({
      chat: chat('direct'),
      character: speaker,
      characters: [speaker],
      messages: [message('今天太阳好大。')],
      now: 2000,
    });

    expect(projection.continuity.userProfile).toContain('用户不喜欢太甜的饮料。');
    expect(projection.relationship.targetName).toBe('用户');
    expect(projection.relationship.stance).toContain('更容易靠近、维护或给对方留余地');
    expect(projection.currentState.activeNeeds).toContain('希望被理解');
  });

  it('combines group pressure, target relationship, and active room lines', () => {
    const target = character({ id: 'char-b', name: '小铁' });
    const speaker = character({
      relationships: [{ characterId: 'char-b', warmth: -18, competence: 22, trust: -24, threat: 36, note: '认可能力，但对他保持戒备。' }],
    });
    const projection = buildCharacterMindProjection({
      chat: chat('group'),
      character: speaker,
      characters: [speaker, target],
      messages: [message('先别急着替我下结论。', 'char-b')],
      now: 2000,
    });

    expect(projection.relationship.targetName).toBe('小铁');
    expect(projection.relationship.stance).toContain('会验证、保留或不轻易相信');
    expect(projection.relationship.currentRoomPressure).toContain('目标正在承受房间里的集中压力。');
    expect(projection.room.activeLines.length).toBeGreaterThan(0);
    expect(projection.expression.omissions).toContain('内部状态分数');
  });

  it('renders a compact model-facing block without exposing hidden trace fields', () => {
    const speaker = character();
    const projection = buildCharacterMindProjection({
      chat: chat('direct'),
      character: speaker,
      characters: [speaker],
      messages: [message('今天太阳好大。')],
      now: 2000,
    });
    const block = buildCharacterMindProjectionPromptBlock(projection, { visibility: 'private' });

    expect(block).toContain('## Character Mind Projection');
    expect(block).toContain('用户不喜欢太甜的饮料。');
    expect(block).not.toContain('sourceIds');
    expect(block).not.toContain('score');
  });

  it('defaults model-facing blocks to public-safe continuity without raw private facts or transcript text', () => {
    const speaker = character({
      relationships: [{ characterId: 'char-b', warmth: 72, competence: 10, trust: 86, threat: 0, note: '共同秘密是雨夜便利店。' }],
      layeredMemories: [{
        id: 'leaky',
        ownerId: 'char-a',
        scope: 'relationship',
        layer: 'long_term',
        kind: 'bond',
        subjectIds: ['char-b'],
        text: '3c78729f-e52d-4dde-b27f-01a949960bb8b 与 char-b 有雨夜便利店暗号',
        salience: 0.8,
        confidence: 0.9,
        recency: 1,
        reinforcementCount: 1,
        sourceEventIds: ['evt-secret'],
        sourceTag: 'test',
        origin: 'runtime',
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        distilledAt: null,
        distilledFromIds: [],
        distillationVersion: null,
      }],
    });
    const target = character({ id: 'char-b', name: '阿远' });
    const projection = buildCharacterMindProjection({
      chat: chat('group'),
      character: speaker,
      characters: [speaker, target],
      messages: [message('那次雨夜我不是故意失约。', 'char-b')],
      now: 2000,
    });
    const block = buildCharacterMindProjectionPromptBlock(projection);

    expect(block).toContain('Relationship continuity exists');
    expect(block).toContain('Active room lines exist');
    expect(block).not.toContain('雨夜便利店');
    expect(block).not.toContain('那次雨夜我不是故意失约');
    expect(block).not.toContain('3c78729f-e52d-4dde-b27f-01a949960bb8b');
  });
});
