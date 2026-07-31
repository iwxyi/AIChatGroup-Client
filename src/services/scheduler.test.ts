import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import { DEFAULT_CONVERSATION_DIRECTOR_CONTROLS, DEFAULT_CONVERSATION_DRAMA_RULES, DEFAULT_CONVERSATION_GOVERNANCE, DEFAULT_CONVERSATION_WORLD_STATE } from '../types/chat';
import { calculateWeights } from './scheduler';
import type { DirectorIntent } from './directorIntent';

const realMathRandom = Math.random;
Math.random = () => 0;

afterAll(() => {
  Math.random = realMathRandom;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T14:00:00+08:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

function buildCharacter(id: string, name: string, patch: Partial<AICharacter> = {}): AICharacter {
  return {
    id,
    name,
    avatar: '',
    personality: { openness: 50, extroversion: 50, agreeableness: 50, neuroticism: 50, humor: 50, creativity: 50, assertiveness: 50, empathy: 50 },
    behavior: { proactivity: 50, aggressiveness: 50, humorIntensity: 50, empathyLevel: 50, summarizing: 50, offTopic: 50 },
    expertise: [],
    speakingStyle: '',
    background: '',
    relationships: [],
    memory: { longTerm: [], shortTermSummary: '', secrets: [], obsessions: [], tabooTopics: [], userMemories: [] },
    intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
    isPreset: false,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

function buildChat(): GroupChat {
  return {
    id: 'chat-1',
    type: 'group',
    mode: 'open_chat',
    modeConfig: { freeSpeaking: true, allowInterruptions: true, allowPrivateThreads: true, allowDirectorInterventions: true, showRoleActions: true },
    modeState: { phase: 'free' },
    name: '群聊',
    topic: '测试',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['a', 'b'],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    topicSeed: '',
    sourceChatId: null,
    sourceMemberIds: [],
    runtimeTimeline: [],
    runtimeEventsV2: [],
    relationshipLedger: [],
    governance: DEFAULT_CONVERSATION_GOVERNANCE,
    dramaRules: DEFAULT_CONVERSATION_DRAMA_RULES,
    worldState: DEFAULT_CONVERSATION_WORLD_STATE,
    directorControls: DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
  };
}

function buildMessage(patch: Partial<Message>): Message {
  return {
    id: patch.id || 'm1',
    chatId: 'chat-1',
    type: patch.type || 'ai',
    senderId: patch.senderId || 'a',
    senderName: patch.senderName || '甲',
    content: patch.content || '',
    emotion: 0,
    timestamp: patch.timestamp || 1,
    isDeleted: false,
  };
}

describe('scheduler speaker scoring', () => {
  it('boosts the actor targeted by DirectorIntent and exposes score reasons', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'answer',
      targetActorIds: ['b'],
      pressure: 0.9,
      reason: '用户点名乙',
    };
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '乙，你说呢？' })],
      {},
      1,
      0,
      null,
      buildChat(),
      intent,
    );
    const a = candidates.find((candidate) => candidate.characterId === 'a');
    const b = candidates.find((candidate) => candidate.characterId === 'b');
    expect(b?.weight).toBeGreaterThan(a?.weight || 0);
    expect(b?.scoreBreakdown?.lineInvolvement).toBeGreaterThan(0);
    expect(b?.scoreBreakdown?.reasons).toContain('director:answer:target');
  });

  it('surfaces emotional aftermath as a speaker reason', () => {
    const candidates = calculateWeights(
      [
        buildCharacter('a', '甲'),
        buildCharacter('b', '乙', { emotionalState: { irritation: 18, affection: 0, insecurity: 6, excitement: 0, embarrassment: 0 } }),
      ],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '你这也太不靠谱了吧？' })],
      {},
      1,
      0,
      null,
      buildChat(),
    );

    const b = candidates.find((candidate) => candidate.characterId === 'b');
    expect(b?.scoreBreakdown?.emotionalPressure).toBeGreaterThan(0);
    expect(b?.scoreBreakdown?.reasons).toContain('emotion:tension');
  });

  it('does not treat generic second-person wording as an explicit direct cue', () => {
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '你这也太不靠谱了吧？' })],
      {},
      1,
      0,
      null,
      buildChat(),
    );

    const b = candidates.find((candidate) => candidate.characterId === 'b');
    expect(b?.scoreBreakdown?.addressed).toBe(0);
  });

  it('boosts a direct cue only when the previous AI line explicitly addresses that actor', () => {
    const addressedMessage = buildMessage({ senderId: 'a', senderName: '甲', content: '刚才那个锅底方案我不太同意。' }) as Message & {
      addressedTargetIds: string[];
      primaryAddressedTargetId: string;
    };
    addressedMessage.addressedTargetIds = ['b'];
    addressedMessage.primaryAddressedTargetId = 'b';

    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [addressedMessage],
      {},
      1,
      0,
      null,
      buildChat(),
    );

    const b = candidates.find((candidate) => candidate.characterId === 'b');
    expect(b?.scoreBreakdown?.addressed).toBeGreaterThan(0);
  });

  it('drops low-pressure stay-silent candidates when another actor has a live cue', () => {
    const addressedMessage = buildMessage({ senderId: 'a', senderName: '甲', content: '乙，你来定。' }) as Message & {
      addressedTargetIds: string[];
      primaryAddressedTargetId: string;
    };
    addressedMessage.addressedTargetIds = ['b'];
    addressedMessage.primaryAddressedTargetId = 'b';

    const candidates = calculateWeights(
      [buildCharacter('b', '乙'), buildCharacter('c', '丙')],
      [addressedMessage],
      {},
      1,
      0,
      null,
      { ...buildChat(), memberIds: ['b', 'c'] },
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['b']);
  });

  it('excludes muted members from speaker candidates when mute governance is enabled', () => {
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '乙，你说呢？' })],
      {},
      1,
      0,
      null,
      {
        ...buildChat(),
        governance: { ...DEFAULT_CONVERSATION_GOVERNANCE, allowMute: true },
        scenarioState: {
          seats: [
            { seatId: 'seat-a', seatIndex: 0, actorId: 'a' },
            { seatId: 'seat-b', seatIndex: 1, actorId: 'b', muted: true },
          ],
        },
      },
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['a']);
  });

  it('excludes temporarily away and deleted characters from speaker candidates', () => {
    const now = Date.now();
    const candidates = calculateWeights(
      [
        buildCharacter('a', '甲'),
        buildCharacter('b', '乙', {
          presence: { status: 'away', activity: '睡觉', updatedAt: now, unavailableUntil: now + 60_000 },
        }),
        buildCharacter('c', '丙', { deletedAt: now }),
      ],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '乙和丙，你们说呢？' })],
      {},
      1,
      0,
      null,
      buildChat(),
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['a']);
  });

  it('lets explicit user media guidance override cooldown and suppress non-target speakers', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'answer',
      targetActorIds: ['b'],
      pressure: 0.98,
      reason: '用户指定角色发送或创作图片。',
      userGuidance: {
        kind: 'media_request',
        rawText: '乙发个甲的照片',
        actorIds: ['b'],
        mentionedActorIds: ['b', 'a'],
        mediaRequest: {
          kind: 'image',
          subjectActorIds: ['a'],
          subjectText: '甲',
          actionText: '发个甲的照片',
        },
        focusText: '乙发个甲的照片',
        beatType: 'answer',
        pressure: 0.98,
        maxTurns: 1,
        reason: '用户指定角色发送或创作图片。',
      },
    };
    const now = Date.now();
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '刚刚说过一句。', timestamp: now })],
      { b: now },
      1,
      60_000,
      null,
      buildChat(),
      intent,
    );

    const a = candidates.find((candidate) => candidate.characterId === 'a');
    const b = candidates.find((candidate) => candidate.characterId === 'b');
    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['b']);
    expect(a).toBeUndefined();
    expect(b).toBeTruthy();
    expect(b?.scoreBreakdown?.reasons).toContain('director:media_request:target');
  });

  it('uses latest topic guidance as the main topic relevance source instead of stale banter', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'invite',
      targetActorIds: [],
      pressure: 0.58,
      reason: '用户正在明确改变群聊焦点。',
      userGuidance: {
        kind: 'topic_shift',
        rawText: '新话题：狼抓羊有过错吗？狼应该抓羊吗？',
        actorIds: [],
        mentionedActorIds: [],
        focusText: '新话题：狼抓羊有过错吗？狼应该抓羊吗？',
        beatType: 'invite',
        pressure: 0.58,
        maxTurns: 3,
        reason: '用户正在明确改变群聊焦点。',
      },
    };
    const candidates = calculateWeights(
      [
        buildCharacter('banana', '蕉太狼', { expertise: ['香蕉', '甜点'] }),
        buildCharacter('ethics', '慢羊羊', { expertise: ['狼抓羊', '伦理', '自然法则'] }),
      ],
      [
        buildMessage({ id: 'm1', senderId: 'banana', senderName: '蕉太狼', content: '香蕉香蕉香蕉，灰太狼的胡子也像香蕉。', timestamp: 10 }),
        buildMessage({ id: 'm2', senderId: 'banana', senderName: '蕉太狼', content: '香蕉证件照也不是不行。', timestamp: 20 }),
        buildMessage({ id: 'm3', type: 'user', senderId: 'user', senderName: '我', content: '新话题：狼抓羊有过错吗？狼应该抓羊吗？', timestamp: 30 }),
      ],
      {},
      1,
      0,
      null,
      buildChat(),
      intent,
    );

    const banana = candidates.find((candidate) => candidate.characterId === 'banana');
    const ethics = candidates.find((candidate) => candidate.characterId === 'ethics');
    expect(ethics?.scoreBreakdown?.topicRelevance).toBeGreaterThan(banana?.scoreBreakdown?.topicRelevance || 0);
  });

  it('adds attention_state bias for actors with strong user-focused attention', () => {
    const chat = buildChat();
    chat.runtimeEventsV2 = [{
      id: 'att-1',
      conversationId: chat.id,
      kind: 'attention_candidate',
      createdAt: Date.now() - 60_000,
      actorIds: ['b'],
      targetIds: ['user'],
      summary: '乙对用户有跟进动机',
      visibility: 'derived_public',
      payload: { reason: '用户刚点名乙', confidence: 0.9, targetIds: ['user'] },
    }];
    chat.relationshipLedger = [{
      pairKey: 'b->user',
      actorId: 'b',
      targetId: 'user',
      current: { warmth: 7, trust: 6, competence: 3, threat: 1 },
      trend: 'up',
      recentEvents: [],
      lastUpdatedAt: Date.now() - 90_000,
    }];

    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '先看看谁接。' })],
      {},
      1,
      0,
      null,
      chat,
      null,
    );
    const b = candidates.find((candidate) => candidate.characterId === 'b');
    expect(b?.scoreBreakdown?.reasons).toContain('attention_state');
  });

  it('does not let attention_state override explicit targeted user guidance', () => {
    const chat = buildChat();
    chat.runtimeEventsV2 = [{
      id: 'att-1',
      conversationId: chat.id,
      kind: 'attention_candidate',
      createdAt: Date.now() - 60_000,
      actorIds: ['a'],
      targetIds: ['user'],
      summary: '甲想跟进用户',
      visibility: 'derived_public',
      payload: { reason: '用户刚点名甲', confidence: 0.9, targetIds: ['user'] },
    }];
    chat.relationshipLedger = [{
      pairKey: 'a->user',
      actorId: 'a',
      targetId: 'user',
      current: { warmth: 7, trust: 6, competence: 3, threat: 1 },
      trend: 'up',
      recentEvents: [],
      lastUpdatedAt: Date.now() - 90_000,
    }];
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'answer',
      targetActorIds: ['b'],
      pressure: 0.95,
      reason: '用户点名乙优先回应',
      userGuidance: {
        kind: 'direct_reply',
        rawText: '乙先说',
        actorIds: ['b'],
        mentionedActorIds: ['b'],
        focusText: '乙先说',
        beatType: 'answer',
        pressure: 0.95,
        maxTurns: 1,
        reason: '用户点名乙优先回应',
      },
    };
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '先看看谁接。' })],
      {},
      1,
      0,
      null,
      chat,
      intent,
    );
    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['b']);
  });

  it('keeps named hard constraints active without forcing the constrained actor to monopolize speech', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'invite',
      targetActorIds: [],
      pressure: 0.84,
      reason: '用户提到角色并给出了需要持续遵守的群聊约束。',
      userGuidance: {
        kind: 'topic_shift',
        rawText: '小唐预算不超过80，别忽略她',
        actorIds: [],
        mentionedActorIds: ['tang'],
        hardConstraintActorIds: ['tang'],
        hasHardConstraints: true,
        focusText: '小唐预算不超过80，别忽略她',
        beatType: 'invite',
        pressure: 0.84,
        maxTurns: 5,
        reason: '用户提到角色并给出了需要持续遵守的群聊约束。',
      },
    };
    const now = Date.now();
    const candidates = calculateWeights(
      [buildCharacter('tang', '小唐'), buildCharacter('a', '安安'), buildCharacter('b', '周策')],
      [
        buildMessage({ senderId: 'a', senderName: '安安', content: '我倾向近一点。', timestamp: now - 10_000 }),
        buildMessage({ senderId: 'b', senderName: '周策', content: '预算先放一放。', timestamp: now }),
      ],
      { tang: now },
      1,
      60_000,
      null,
      { ...buildChat(), memberIds: ['tang', 'a', 'b'] },
      intent,
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['a']);
  });

  it('suppresses a criticized hijacking actor during a corrective guidance window', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'answer',
      targetActorIds: [],
      pressure: 0.92,
      reason: '用户点名角色回应。',
      userGuidance: {
        kind: 'direct_reply',
        rawText: '我刚才是想听安安说，不是让周策替她做决定。',
        actorIds: ['anan'],
        mentionedActorIds: ['anan', 'zhou'],
        suppressedActorIds: ['zhou'],
        focusText: '我刚才是想听安安说，不是让周策替她做决定。',
        beatType: 'answer',
        pressure: 0.92,
        maxTurns: 5,
        reason: '用户点名角色回应。',
      },
    };
    const candidates = calculateWeights(
      [buildCharacter('anan', '安安'), buildCharacter('zhou', '周策'), buildCharacter('mei', '梅青')],
      [
        buildMessage({ senderId: 'anan', senderName: '安安', content: '我已经把访谈结论说清楚了。', timestamp: 10 }),
        buildMessage({ senderId: 'mei', senderName: '梅青', content: '那接下来别急着让周策重新包装。', timestamp: 20 }),
      ],
      {},
      1,
      0,
      null,
      { ...buildChat(), memberIds: ['anan', 'zhou', 'mei'] },
      intent,
    );

    expect(candidates.map((candidate) => candidate.characterId)).not.toContain('zhou');
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('keeps suppression-only guidance from protecting the last speaker into repetition', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'answer',
      targetActorIds: [],
      pressure: 0.92,
      reason: '用户点名角色回应。',
      userGuidance: {
        kind: 'direct_reply',
        rawText: '我刚才是想听安安说，不是让周策替她做决定。',
        actorIds: ['anan'],
        mentionedActorIds: ['anan', 'zhou'],
        suppressedActorIds: ['zhou'],
        focusText: '我刚才是想听安安说，不是让周策替她做决定。',
        beatType: 'answer',
        pressure: 0.92,
        maxTurns: 5,
        reason: '用户点名角色回应。',
      },
    };
    const now = Date.now();
    const candidates = calculateWeights(
      [
        buildCharacter('anan', '安安', { behavior: { proactivity: 18, aggressiveness: 4, humorIntensity: 8, empathyLevel: 78, summarizing: 20, offTopic: 6 } }),
        buildCharacter('zhou', '周策', { behavior: { proactivity: 86, aggressiveness: 48, humorIntensity: 20, empathyLevel: 26, summarizing: 60, offTopic: 10 } }),
        buildCharacter('mei', '梅青', { behavior: { proactivity: 54, aggressiveness: 12, humorIntensity: 26, empathyLevel: 72, summarizing: 44, offTopic: 10 } }),
      ],
      [
        buildMessage({ senderId: 'mei', senderName: '梅青', content: '周策，可以先让安安把访谈原话说完。', timestamp: now - 40_000 }),
        buildMessage({ senderId: 'anan', senderName: '安安', content: '入口和客服是两个主要问题。', timestamp: now - 20_000 }),
        buildMessage({ senderId: 'anan', senderName: '安安', content: '我会把这些整理成时间表。', timestamp: now }),
      ],
      {},
      1,
      0,
      null,
      { ...buildChat(), memberIds: ['anan', 'zhou', 'mei'] },
      intent,
    );

    expect(candidates.map((candidate) => candidate.characterId)).not.toContain('anan');
    expect(candidates.map((candidate) => candidate.characterId)).not.toContain('zhou');
    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['mei']);
  });

  it('removes the previous AI speaker from normal rotation when another member can speak', () => {
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙'), buildCharacter('c', '丙')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '我刚说完，看看别人怎么想。' })],
      {},
      1,
      0,
      null,
      { ...buildChat(), memberIds: ['a', 'b', 'c'] },
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['b', 'c']);
  });

  it('keeps the previous AI speaker when explicit user guidance targets that speaker', () => {
    const intent: DirectorIntent = {
      source: 'user_message',
      beatType: 'answer',
      targetActorIds: ['a'],
      pressure: 0.95,
      reason: '用户明确要求甲继续回答',
      userGuidance: {
        kind: 'direct_reply',
        rawText: '甲继续说',
        actorIds: ['a'],
        mentionedActorIds: ['a'],
        focusText: '甲继续说',
        beatType: 'answer',
        pressure: 0.95,
        maxTurns: 1,
        reason: '用户明确要求甲继续回答',
      },
    };
    const candidates = calculateWeights(
      [buildCharacter('a', '甲'), buildCharacter('b', '乙')],
      [
        buildMessage({ senderId: 'a', senderName: '甲', content: '我先说一句。' }),
        buildMessage({ type: 'user', senderId: 'user', senderName: '用户', content: '甲继续说。' }),
      ],
      {},
      1,
      0,
      null,
      buildChat(),
      intent,
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['a']);
  });

  it('keeps the previous AI speaker when no other member can speak', () => {
    const candidates = calculateWeights(
      [buildCharacter('a', '甲')],
      [buildMessage({ senderId: 'a', senderName: '甲', content: '这里只有我。' })],
      {},
      1,
      0,
      null,
      { ...buildChat(), memberIds: ['a'] },
    );

    expect(candidates.map((candidate) => candidate.characterId)).toEqual(['a']);
  });
});
