import { describe, expect, it } from 'vitest';
import type { GroupChat } from '../../types/chat';
import type { AICharacter } from '../../types/character';
import { DEFAULT_CHARACTER_BEHAVIOR, DEFAULT_CHARACTER_INTERVENTION, DEFAULT_CHARACTER_MEMORY, DEFAULT_PERSONALITY } from '../../types/character';
import { rankCharacterResources, rankChatResources } from './resourceIndex';

function character(id: string, name: string, group: string | null, background: string): AICharacter {
  return {
    id,
    name,
    avatar: '🤖',
    personality: DEFAULT_PERSONALITY,
    behavior: DEFAULT_CHARACTER_BEHAVIOR,
    expertise: [],
    speakingStyle: '自然表达。',
    background,
    group,
    relationships: [],
    memory: DEFAULT_CHARACTER_MEMORY,
    intervention: DEFAULT_CHARACTER_INTERVENTION,
    isPreset: false,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
  };
}

function chat(id: string, name: string, topic: string): GroupChat {
  return {
    id,
    type: 'group',
    mode: 'open_chat',
    sessionKind: { topology: 'group', family: 'conversation', scenarioId: 'open_chat', surfaceProfile: 'text' },
    modeConfig: {},
    modeState: {},
    name,
    topic,
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['user'],
    speed: 1,
    isActive: false,
    allowIntervention: true,
    showRoleActions: true,
    topicSeed: '',
    governance: {},
    dramaRules: {},
    worldState: {},
    directorControls: {},
    createdAt: 1000,
    updatedAt: 1000,
    lastMessageAt: 1000,
    deletedAt: null,
  } as GroupChat;
}

describe('resourceIndex', () => {
  it('ranks within the planner-selected character domain and respects the source group', () => {
    const matches = rankCharacterResources({
      characters: [
        character('qin', '秦始皇', '帝王', '中国第一位皇帝。'),
        character('scholar', '史官小周', '学者', '研究皇帝制度的历史学者。'),
      ],
      queries: ['皇帝'],
      sourceGroup: '帝王',
    });

    expect(matches.map((item) => item.id)).toEqual(['qin']);
  });

  it('recalls Chinese resources from natural-language query text inside the selected domain', () => {
    const matches = rankCharacterResources({
      characters: [
        character('qin', '秦始皇', '帝王', '中国第一位皇帝。'),
        character('cook', '御厨小满', '饮食', '擅长宫廷点心。'),
      ],
      queries: ['哪些是皇帝的角色'],
    });

    expect(matches.map((item) => item.id)).toContain('qin');
  });

  it('ranks chats from cached messages and ignores deleted messages', () => {
    const matches = rankChatResources({
      chats: [
        chat('qin-chat', '帝王闲谈', '古代人物讨论'),
        chat('food-chat', '晚餐', '家常菜'),
      ],
      query: '秦始皇',
      includeMessages: true,
      messagesByChatId: {
        'qin-chat': [
          { content: '今天讨论秦始皇统一六国。', isDeleted: false },
          { content: '已删除的秦始皇内容。', isDeleted: true },
        ],
      },
    });

    expect(matches.map((item) => item.chat.id)).toEqual(['qin-chat']);
  });
});
