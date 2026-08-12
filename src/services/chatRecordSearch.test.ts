import { describe, expect, it } from 'vitest';
import { createDefaultSessionKind, DEFAULT_CONVERSATION_DIRECTOR_CONTROLS, DEFAULT_CONVERSATION_DRAMA_RULES, DEFAULT_CONVERSATION_GOVERNANCE, DEFAULT_CONVERSATION_WORLD_STATE, DEFAULT_OPEN_CHAT_MODE_CONFIG, DEFAULT_OPEN_CHAT_MODE_STATE, type GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import { searchLocalChatRecords } from './chatRecordSearch';

function storyChat(): GroupChat {
  return {
    id: 'story-chat-1',
    type: 'group',
    mode: 'story',
    sessionKind: createDefaultSessionKind('story_reader', 'story_reader'),
    modeConfig: DEFAULT_OPEN_CHAT_MODE_CONFIG,
    modeState: DEFAULT_OPEN_CHAT_MODE_STATE,
    name: '三国红楼故事房',
    topic: '人物融合大纲',
    style: 'roleplay',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['user'],
    speed: 1,
    isActive: false,
    allowIntervention: true,
    showRoleActions: true,
    topicSeed: '',
    governance: DEFAULT_CONVERSATION_GOVERNANCE,
    dramaRules: DEFAULT_CONVERSATION_DRAMA_RULES,
    worldState: DEFAULT_CONVERSATION_WORLD_STATE,
    directorControls: DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    deletedAt: null,
  };
}

function message(id: string, text: string, timestamp: number): Message {
  return {
    id,
    chatId: 'story-chat-1',
    type: 'ai',
    senderId: 'narrator',
    senderName: '旁白',
    content: '',
    metadata: {
      narrativeTurn: {
        turnId: id,
        turnKind: 'narrative_beat',
        blocks: [{
          id: `${id}-block`,
          actorId: 'narrator',
          actorKind: 'narrator',
          kind: 'prose',
          displayMode: 'paragraph',
          text,
        }],
      },
    },
    emotion: 0,
    timestamp,
    isDeleted: false,
  };
}

describe('chatRecordSearch', () => {
  it('matches story room narrative blocks across nearby messages', () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const currentDay = now.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const lastWednesday = new Date(now);
    lastWednesday.setDate(now.getDate() + mondayOffset - 5);
    const result = searchLocalChatRecords({
      chats: [storyChat()],
      query: '上周三我聊到的三国和红楼里面人物结合的大纲',
      now,
      messagesByChatId: {
        'story-chat-1': [
          message('m1', '故事大纲第一幕：三国谋士进入贾府，借诗会试探局势。', lastWednesday.getTime()),
          message('m2', '红楼人物与诸葛亮、周瑜的关系需要分成三条暗线。', lastWednesday.getTime() + 1),
        ],
      },
    });

    expect(result.matches[0]).toMatchObject({
      chatId: 'story-chat-1',
      chatMode: 'story',
    });
    expect(result).toMatchObject({
      totalCount: 2,
      returnedCount: 2,
      hasMore: false,
      sortBy: 'relevance',
    });
    expect(result.matches[0]?.messageId).toMatch(/^m[12]$/);
    expect(result.matches[0]?.snippet).toContain('三国');
    expect(result.matches[0]?.snippet).toContain('红楼');
  });

  it('returns total count and slices by offset and limit', () => {
    const result = searchLocalChatRecords({
      chats: [storyChat()],
      query: '红楼',
      limit: 1,
      offset: 1,
      sortBy: 'time_asc',
      messagesByChatId: {
        'story-chat-1': [
          message('m1', '红楼第一条线索。', 100),
          message('m2', '红楼第二条线索。', 200),
          message('m3', '红楼第三条线索。', 300),
        ],
      },
    });

    expect(result).toMatchObject({
      totalCount: 3,
      returnedCount: 1,
      hasMore: true,
      offset: 1,
      limit: 1,
      sortBy: 'time_asc',
    });
    expect(result.matches.map((item) => item.messageId)).toEqual(['m2']);
  });
});
