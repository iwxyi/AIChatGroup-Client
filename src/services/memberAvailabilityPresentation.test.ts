import { describe, expect, it } from 'vitest';
import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import {
  DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
  DEFAULT_CONVERSATION_DRAMA_RULES,
  DEFAULT_CONVERSATION_GOVERNANCE,
  DEFAULT_CONVERSATION_WORLD_STATE,
} from '../types/chat';
import { buildMemberAvailabilityChips } from './memberAvailabilityPresentation';

function character(patch: Partial<AICharacter> = {}): AICharacter {
  return {
    id: 'a',
    name: '甲',
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

function chat(patch: Partial<GroupChat> = {}): GroupChat {
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
    governance: { ...DEFAULT_CONVERSATION_GOVERNANCE, allowMute: true },
    dramaRules: DEFAULT_CONVERSATION_DRAMA_RULES,
    worldState: DEFAULT_CONVERSATION_WORLD_STATE,
    directorControls: DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    ...patch,
  };
}

describe('memberAvailabilityPresentation', () => {
  it('shows away, muted, and deleted chips for unavailable members', () => {
    const now = 1_000;
    const chips = buildMemberAvailabilityChips({
      member: character({
        deletedAt: now,
        presence: {
          status: 'away',
          activity: '睡觉',
          reason: '说要去睡了',
          unavailableUntil: now + 60 * 60_000,
          updatedAt: now,
        },
      }),
      chat: chat({
        scenarioState: {
          seats: [
            { seatId: 'seat-a', seatIndex: 0, actorId: 'a', muted: true },
          ],
        },
      }),
      now,
      language: 'zh-CN',
    });

    expect(chips.map((item) => item.label)).toEqual(['已删除', '禁言', '暂离：睡觉']);
    expect(chips.find((item) => item.key === 'away')?.hint).toContain('预计 1小时 后恢复');
  });

  it('does not show away chip after the temporary away window expires', () => {
    const chips = buildMemberAvailabilityChips({
      member: character({
        presence: {
          status: 'away',
          activity: '洗澡',
          unavailableUntil: 1_000,
          updatedAt: 1,
        },
      }),
      now: 2_000,
      language: 'zh-CN',
    });

    expect(chips).toEqual([]);
  });

  it('does not show deleted chip for the user pseudo-member', () => {
    const chips = buildMemberAvailabilityChips({
      member: character({
        id: 'user',
        name: '我',
        deletedAt: 1_000,
      }),
      now: 2_000,
      language: 'zh-CN',
    });

    expect(chips.map((item) => item.key)).not.toContain('deleted');
  });
});
