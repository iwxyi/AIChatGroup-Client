import { describe, expect, it } from 'vitest';
import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import type { SpeakIntent } from './intentEngine';
import { buildTurnPlanPrompt, deriveTurnPlan } from './turnPlanner';

function character(patch: Partial<AICharacter> = {}): AICharacter {
  return {
    id: 'char-a',
    name: '苏苏',
    avatar: '',
    personality: { openness: 50, extroversion: 80, agreeableness: 50, neuroticism: 50, humor: 50, creativity: 50, assertiveness: 50, empathy: 50 },
    behavior: { proactivity: 85, aggressiveness: 40, humorIntensity: 78, empathyLevel: 50, summarizing: 45, offTopic: 30 },
    expertise: [],
    speakingStyle: '',
    background: '',
    relationships: [],
    memory: { longTerm: [], shortTermSummary: '', secrets: [], obsessions: [], tabooTopics: [], userMemories: [] },
    intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
    isPreset: false,
    speechProfile: { catchphrases: [], fillers: [], tabooPhrases: [], preferredOpeners: [], preferredClosers: [], sentenceLengthBias: 'mixed', questionBias: 50, sarcasmBias: 50 },
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

function chat(patch: Partial<GroupChat> = {}): GroupChat {
  return {
    id: 'chat-1',
    type: 'direct',
    mode: 'open_chat',
    name: '测试',
    topic: '',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['char-a'],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    topicSeed: '',
    modeConfig: { freeSpeaking: true, allowInterruptions: true, allowPrivateThreads: true, allowDirectorInterventions: true, showRoleActions: true },
    modeState: { phase: 'free' },
    governance: { ownerCharacterId: null, adminCharacterIds: [], autoModeration: false, allowMute: true, allowPrivateThreads: true },
    dramaRules: { allowCliques: false, allowMockery: false, allowAlliances: true, allowContempt: false },
    worldState: { phase: 'idle', mood: '', focus: '', recentEvent: '', conflictAxes: [] },
    directorControls: { allowSpeakAs: true, allowDirectorMode: true, allowEventInjection: true, allowForcedReply: true },
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    ...patch,
  } as GroupChat;
}

function message(patch: Partial<Message>): Message {
  return {
    id: 'msg-1',
    chatId: 'chat-1',
    type: 'user',
    senderId: 'user',
    senderName: '用户',
    content: '',
    emotion: 0,
    timestamp: 1,
    isDeleted: false,
    ...patch,
  };
}

const intent: SpeakIntent = {
  shouldSpeak: true,
  reason: 'test',
  target: 'user',
  stance: 'support',
  emotionalTone: 'warm',
  delivery: 'short_reply',
  messageShape: 'single_sentence',
};

function fragmentIntent(): SpeakIntent {
  return {
    ...intent,
    delivery: 'side_remark',
    messageShape: 'fragment',
  };
}

describe('deriveTurnPlan', () => {
  it('marks short open user turns as wait-sensitive without keyword checks', () => {
    const plan = deriveTurnPlan({
      chat: chat(),
      speaker: character(),
      messages: [message({ content: '等下', timestamp: 10 })],
      intent,
      surface: { kind: 'chat' },
      now: 10,
    });

    expect(plan.rhythm).toBe('defer_or_wait');
    expect(plan.waitSensitive).toBe(true);
    expect(plan.allowExtraMessages).toBe(false);
  });

  it('allows planned multi-bubble turns from structural spacing signals', () => {
    const plan = deriveTurnPlan({
      chat: chat({ id: 'chat-6' }),
      speaker: character({ id: 'char-z' }),
      messages: [
        message({ id: 'u1', content: '你刚才说那个青色苹果，是不是还没熟的意思？', timestamp: 100 }),
      ],
      intent,
      surface: { kind: 'chat' },
      now: 100,
    });

    expect(['multi_bubble', 'short_reply', 'full_reply']).toContain(plan.rhythm);
    if (plan.rhythm === 'multi_bubble') {
      expect(plan.allowExtraMessages).toBe(true);
      expect(plan.targetBubbleCount).toBeGreaterThan(1);
    }
  });

  it('keeps professional surfaces single-bubble and long-form capable', () => {
    const plan = deriveTurnPlan({
      chat: chat(),
      speaker: character(),
      messages: [message({ content: '请详细解释一下这个方案的设计取舍和风险点。', timestamp: 10 })],
      intent,
      surface: { kind: 'professional' },
    });

    expect(plan.rhythm).toBe('full_reply');
    expect(plan.allowExtraMessages).toBe(false);
    expect(plan.targetBubbleCount).toBe(1);
  });

  it('does not make analysis-room AI continuations long just because the surface is professional', () => {
    const plan = deriveTurnPlan({
      chat: chat({
        type: 'group',
        sessionKind: { topology: 'group', family: 'analysis', scenarioId: 'opinion-review', surfaceProfile: 'text' },
      }),
      speaker: character(),
      messages: [
        message({
          type: 'ai',
          senderId: 'other',
          senderName: '甲',
          content: '我觉得这个结论已经差不多了，大家其实都在说同一个意思，只是换了几个比喻。',
          timestamp: 10,
        }),
      ],
      intent: {
        ...intent,
        stance: 'probe',
        delivery: 'quick_question',
        messageShape: 'question_only',
      },
      surface: { kind: 'professional' },
    });

    expect(plan.rhythm).toBe('short_reply');
    expect(plan.lengthBand).toBe('short');
    expect(plan.reasons).toContain('analysis_room');
    expect(plan.reasons).toContain('ai_continuation');
  });

  it('still allows full analysis replies when a human turn asks for substance', () => {
    const plan = deriveTurnPlan({
      chat: chat({
        type: 'group',
        sessionKind: { topology: 'group', family: 'analysis', scenarioId: 'opinion-review', surfaceProfile: 'text' },
      }),
      speaker: character(),
      messages: [message({ content: '请你把刚才几个观点裁决一下，给出证据和反例。', timestamp: 10 })],
      intent: { ...intent, stance: 'summarize', delivery: 'group_redirect', messageShape: 'two_sentences' },
      surface: { kind: 'professional' },
    });

    expect(plan.rhythm).toBe('full_reply');
    expect(plan.lengthBand).toBe('medium');
    expect(plan.reasons).toContain('human_turn');
  });

  it('does not force short human inputs into micro_ack solely from local intent shape', () => {
    const plan = deriveTurnPlan({
      chat: chat(),
      speaker: character({ speechProfile: { catchphrases: [], fillers: [], tabooPhrases: [], preferredOpeners: [], preferredClosers: [], sentenceLengthBias: 'short', questionBias: 30, sarcasmBias: 10 } }),
      messages: [message({ content: '合同责任？', timestamp: 10 })],
      intent: fragmentIntent(),
      surface: { kind: 'chat' },
      now: 10,
    });

    expect(plan.rhythm).not.toBe('micro_ack');
    expect(plan.reasons).not.toContain('fragment_or_tiny_context');
  });

  it('does not turn the internal length band into a fixed prompt target', () => {
    const prompt = buildTurnPlanPrompt({
      rhythm: 'short_reply',
      targetBubbleCount: 1,
      lengthBand: 'medium',
      allowExtraMessages: false,
      waitSensitive: false,
      reasons: ['test'],
    });

    expect(prompt).toContain('Do not target a fixed length band');
    expect(prompt).toContain('not a keyword rule, output template, or length cap');
    expect(prompt).not.toContain('Target length band');
  });
});
