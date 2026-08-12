import { describe, expect, it, vi } from 'vitest';
import type { AppCommandContext } from './commandTypes';
import { routeAppCommand } from './routeCommand';
import { generateResponse } from '../../services/aiClient';

vi.mock('../../services/aiClient', () => ({
  generateResponse: vi.fn(),
}));

const generateResponseMock = vi.mocked(generateResponse);

function context(input = '把小明调外向一点'): AppCommandContext {
  return {
    source: 'assistant',
    input,
    apiConfig: { provider: 'openai', apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model' },
    aiProfiles: [],
  };
}

describe('routeAppCommand', () => {
  it('falls back to assistant agent when planner returns an empty response', async () => {
    generateResponseMock.mockResolvedValueOnce('');

    const { route } = await routeAppCommand(context('解释这张图片'));

    expect(route).toEqual(expect.objectContaining({
      mode: 'assistant_agent',
      initialMessage: '解释这张图片',
    }));
  });

  it('promotes character updates to high risk even when the planner underestimates risk', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'update_characters',
      riskLevel: 'medium',
      requiresConfirmation: false,
      plan: {
        characterQuery: '小明',
        updateInstruction: '调外向一点',
      },
    }));

    const { route } = await routeAppCommand(context());

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('update_characters');
    expect(route.riskLevel).toBe('high');
    expect(route.requiresConfirmation).toBe(true);
  });

  it('promotes workflow risk when any step is high risk', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'workflow',
      riskLevel: 'low',
      requiresConfirmation: false,
      steps: [
        {
          action: 'read_character_info',
          riskLevel: 'low',
          requiresConfirmation: false,
          plan: { characterQuery: '小明' },
        },
        {
          action: 'update_characters',
          riskLevel: 'medium',
          requiresConfirmation: false,
          plan: { characterQuery: '小明', updateInstruction: '调外向一点' },
        },
      ],
    }));

    const { route } = await routeAppCommand(context());

    expect(route.mode).toBe('workflow');
    if (route.mode !== 'workflow') return;
    expect(route.riskLevel).toBe('high');
    expect(route.requiresConfirmation).toBe(true);
    expect(route.steps[1]?.riskLevel).toBe('high');
  });

  it('supports deleting explicitly referenced characters with recent assistant context', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'delete_characters',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: {
        action: 'delete_characters',
        characters: [{ name: '掌柜老陈' }, { name: 'AI茶博士' }, { name: '机械跑堂小铁' }],
      },
    }));

    const { route } = await routeAppCommand({
      ...context('删除这三个角色吧'),
      recentMessages: [
        { role: 'assistant', content: '已准备角色：掌柜老陈、AI茶博士、机械跑堂小铁。可以在角色库查看。' },
        { role: 'user', content: '删除这三个角色吧' },
      ],
    });

    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      [expect.objectContaining({
        content: expect.stringContaining('已准备角色：掌柜老陈、AI茶博士、机械跑堂小铁'),
      })],
      undefined,
      expect.anything(),
    );
    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('delete_characters');
    expect(route.riskLevel).toBe('medium');
    expect(route.requiresConfirmation).toBe(false);
  });

  it('keeps collection-style role queries as a read_character_info tool with collection mode', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'read_character_info',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: {
        action: 'read_character_info',
        characterQuery: '皇帝',
        characterQueryMode: 'collection',
      },
    }));

    const { route } = await routeAppCommand(context('哪些角色是皇帝'));

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('read_character_info');
    expect(route.plan.characterQuery).toBe('皇帝');
    expect(route.plan.characterQueryMode).toBe('collection');
  });

  it('routes chat-record search requests to search_chats', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'search_chats',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: {
        action: 'search_chats',
        chatQuery: '世界杯',
      },
    }));

    const { route } = await routeAppCommand(context('搜索聊天记录里的世界杯'));

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('search_chats');
    expect(route.plan.chatQuery).toBe('世界杯');
  });

  it('keeps advanced chat-search parameters from the planner', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'search_chats',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: {
        action: 'search_chats',
        chat_query: '三国 红楼 大纲',
        chat_search_scope: 'cloud',
        chat_search_sort_by: 'time_desc',
        chat_search_limit: 100,
        chat_search_offset: 200,
      },
    }));

    const { route } = await routeAppCommand(context('云端按时间倒序列出100条三国红楼大纲聊天记录，从第201条开始'));

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('search_chats');
    expect(route.plan).toMatchObject({
      chatQuery: '三国 红楼 大纲',
      chatSearchScope: 'cloud',
      chatSearchSortBy: 'time_desc',
      chatSearchLimit: 100,
      chatSearchOffset: 200,
    });
  });

  it('keeps opening messages for direct chat creation plans', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'create_direct_chat',
      riskLevel: 'medium',
      requiresConfirmation: false,
      plan: {
        action: 'create_direct_chat',
        characterName: '秦始皇',
        openingMessage: '统一六国之后，你最怕哪件事失控？',
      },
    }));

    const { route } = await routeAppCommand(context('让我和秦始皇单聊：统一六国之后，他最怕哪件事失控？'));

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('create_direct_chat');
    expect(route.plan.characterName).toBe('秦始皇');
    expect(route.plan.openingMessage).toBe('统一六国之后，你最怕哪件事失控？');
  });

  it('routes chat topic updates separately from app appearance themes', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'update_chat_topic',
      riskLevel: 'medium',
      requiresConfirmation: false,
      plan: {
        action: 'update_chat_topic',
        chatTypePreference: 'group',
        selectionMode: 'random',
        newTopic: '雨夜叛逃与旧盟约',
      },
    }));

    const { route } = await routeAppCommand(context('随机选一个群聊，帮我换一个更有张力的新聊天话题'));

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('update_chat_topic');
    expect(route.plan.selectionMode).toBe('random');
    expect(route.plan.newTopic).toBe('雨夜叛逃与旧盟约');
  });

  it('routes incomplete model setup requests to the model settings page', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'navigate',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: {
        action: 'navigate',
        routePath: 'ssmm://settings?action=open&tab=models&card=models',
        title: '打开模型设置',
        summary: '需要在模型设置中选择或配置 DeepSeek。',
      },
    }));

    const { route } = await routeAppCommand(context('设置模型为 deepseek'));

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('navigate');
    expect(route.plan.routePath).toBe('ssmm://settings?action=open&tab=models&card=models');
  });
});
