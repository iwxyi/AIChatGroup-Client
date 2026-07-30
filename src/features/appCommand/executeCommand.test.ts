import { describe, expect, it, vi } from 'vitest';
import type { AppCommandContext, AppCommandRoute } from './commandTypes';
import { executeAppCommandRoute, findReusableGroupChat } from './executeCommand';
import { useCharacterStore } from '../../stores/useCharacterStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { GroupChat } from '../../types/chat';
import { DEFAULT_CONVERSATION_DIRECTOR_CONTROLS, DEFAULT_CONVERSATION_DRAMA_RULES, DEFAULT_CONVERSATION_GOVERNANCE, DEFAULT_CONVERSATION_WORLD_STATE, DEFAULT_OPEN_CHAT_MODE_CONFIG, DEFAULT_OPEN_CHAT_MODE_STATE, createDefaultSessionKind } from '../../types/chat';
import type { AICharacter } from '../../types/character';
import { DEFAULT_CHARACTER_BEHAVIOR, DEFAULT_CHARACTER_INTERVENTION, DEFAULT_CHARACTER_MEMORY, DEFAULT_PERSONALITY } from '../../types/character';
import { DEFAULT_CHAT_DRAFT_DEFAULTS } from '../../types/settings';

function context(): AppCommandContext {
  return {
    source: 'home',
    input: '小明',
    navigate: vi.fn(),
    apiConfig: { provider: 'openai', apiKey: '', baseUrl: '', model: 'test-model' },
    aiProfiles: [],
  };
}

function character(id: string, name: string): AICharacter {
  return {
    id,
    name,
    avatar: '🤖',
    personality: DEFAULT_PERSONALITY,
    behavior: DEFAULT_CHARACTER_BEHAVIOR,
    expertise: [],
    speakingStyle: '自然表达。',
    background: `${name} 的背景。`,
    group: null,
    relationships: [],
    memory: DEFAULT_CHARACTER_MEMORY,
    intervention: DEFAULT_CHARACTER_INTERVENTION,
    isPreset: false,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
  };
}

function chat(id: string, name: string, type: GroupChat['type'] = 'group'): GroupChat {
  const sessionKind = createDefaultSessionKind(type === 'assistant' ? 'assistant' : 'open_chat', 'open_chat');
  return {
    id,
    type,
    mode: 'open_chat',
    sessionKind,
    modeConfig: DEFAULT_OPEN_CHAT_MODE_CONFIG,
    modeState: DEFAULT_OPEN_CHAT_MODE_STATE,
    name,
    topic: `${name} 的主题`,
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: type === 'assistant' ? [] : ['user'],
    speed: 1,
    isActive: false,
    allowIntervention: true,
    showRoleActions: type !== 'assistant',
    topicSeed: '',
    governance: DEFAULT_CONVERSATION_GOVERNANCE,
    dramaRules: DEFAULT_CONVERSATION_DRAMA_RULES,
    worldState: DEFAULT_CONVERSATION_WORLD_STATE,
    directorControls: DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
    createdAt: 1000,
    updatedAt: 1000,
    lastMessageAt: 1000,
    deletedAt: null,
  };
}

describe('executeAppCommandRoute', () => {
  it('never auto-executes choices when planner forgets requiresConfirmation', async () => {
    const route: AppCommandRoute = {
      mode: 'local_action',
      action: 'update_theme',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: { action: 'update_theme', theme: 'dark', title: '切换主题' },
      choices: [
        {
          id: 'light',
          label: '浅色',
          kind: 'execute',
          plan: { action: 'update_theme', plan: { action: 'update_theme', theme: 'light' } },
        },
        {
          id: 'dark',
          label: '深色',
          kind: 'execute',
          plan: { action: 'update_theme', plan: { action: 'update_theme', theme: 'dark' } },
        },
      ],
    };

    const result = await executeAppCommandRoute(route, context());

    expect(result.status).toBe('needs_confirmation');
    expect(result.choices?.map((choice) => choice.id)).toEqual(['light', 'dark']);
  });

  it('reuses an existing group chat with the same title topic members and scenario', () => {
    const existing = {
      id: 'chat-1',
      type: 'group' as const,
      deletedAt: undefined,
      name: '曹操与童年曹操',
      topic: '曹操和童年曹操的对话',
      sessionKind: { scenarioId: 'open-chat' },
      memberIds: ['character-child-cao', 'user', 'character-cao'],
    };

    expect(findReusableGroupChat({
      chats: [existing],
      title: '曹操与童年曹操',
      topic: '曹操和童年曹操的对话',
      scenarioId: 'open-chat',
      memberIds: ['user', 'character-cao', 'character-child-cao'],
    })?.id).toBe('chat-1');

    expect(findReusableGroupChat({
      chats: [{ ...existing, deletedAt: Date.now() }],
      title: '曹操与童年曹操',
      topic: '曹操和童年曹操的对话',
      scenarioId: 'open-chat',
      memberIds: ['user', 'character-cao', 'character-child-cao'],
    })).toBeNull();
  });

  it('uses chat draft defaults for app command group creation unless the plan overrides them', async () => {
    const originalAddChat = useChatStore.getState().addChat;
    const originalChatDraftDefaults = useSettingsStore.getState().chatDraftDefaults;
    const addChat = vi.fn(async (draft: Parameters<typeof originalAddChat>[0]) => {
      const created = { ...draft, id: 'chat-created' } as GroupChat;
      useChatStore.setState({ chats: [created] });
      return created;
    });

    useCharacterStore.setState({ characters: [character('char-qin', '秦始皇')] });
    useChatStore.setState({ chats: [], addChat });
    useSettingsStore.setState({
      chatDraftDefaults: {
        ...DEFAULT_CHAT_DRAFT_DEFAULTS,
        includeUserAsMember: false,
        showRoleActions: false,
      },
    });

    try {
      const defaultResult = await executeAppCommandRoute({
        mode: 'local_action',
        action: 'create_group_chat',
        riskLevel: 'medium',
        requiresConfirmation: false,
        plan: {
          action: 'create_group_chat',
          groupName: '帝王群聊',
          groupTopic: '讨论天下',
          characters: [{ name: '秦始皇' }],
        },
      }, context());

      expect(defaultResult.status).toBe('success');
      expect(addChat).toHaveBeenCalledTimes(1);
      expect(addChat.mock.calls[0]?.[0].memberIds).toEqual(['char-qin']);
      expect(addChat.mock.calls[0]?.[0].showRoleActions).toBe(false);

      useChatStore.setState({ chats: [] });
      const overrideResult = await executeAppCommandRoute({
        mode: 'local_action',
        action: 'create_group_chat',
        riskLevel: 'medium',
        requiresConfirmation: false,
        plan: {
          action: 'create_group_chat',
          groupName: '帝王群聊二',
          groupTopic: '继续讨论天下',
          characters: [{ name: '秦始皇' }],
          includeUserAsMember: true,
          showRoleActions: true,
        },
      }, context());

      expect(overrideResult.status).toBe('success');
      expect(addChat).toHaveBeenCalledTimes(2);
      expect(addChat.mock.calls[1]?.[0].memberIds).toEqual(['char-qin', 'user']);
      expect(addChat.mock.calls[1]?.[0].showRoleActions).toBe(true);
    } finally {
      useCharacterStore.setState({ characters: [] });
      useChatStore.setState({ chats: [], addChat: originalAddChat });
      useSettingsStore.setState({ chatDraftDefaults: originalChatDraftDefaults });
    }
  });

  it('deletes explicitly named characters through the character store', async () => {
    const originalDeleteCharacters = useCharacterStore.getState().deleteCharacters;
    const deleteCharacters = vi.fn(async (ids: string[]) => {
      useCharacterStore.setState((state) => ({
        characters: state.characters.map((item) => (
          ids.includes(item.id) ? { ...item, deletedAt: 2000, updatedAt: 2000 } : item
        )),
      }));
    });
    useCharacterStore.setState({
      characters: [
        character('char-chen', '掌柜老陈'),
        character('char-tea', 'AI茶博士'),
        character('char-tie', '机械跑堂小铁'),
      ],
      deleteCharacters,
    });

    try {
      const result = await executeAppCommandRoute({
        mode: 'local_action',
        action: 'delete_characters',
        riskLevel: 'medium',
        requiresConfirmation: false,
        plan: {
          action: 'delete_characters',
          characters: [{ name: '掌柜老陈' }, { name: 'AI茶博士' }, { name: '机械跑堂小铁' }],
        },
      }, context());

      expect(result.status).toBe('success');
      expect(deleteCharacters).toHaveBeenCalledWith(['char-chen', 'char-tea', 'char-tie']);
      expect(result.markdown).toContain('已删除角色：掌柜老陈、AI茶博士、机械跑堂小铁');
    } finally {
      useCharacterStore.setState({ characters: [], deleteCharacters: originalDeleteCharacters });
    }
  });

  it('renames a resolved chat through the chat store', async () => {
    const originalUpdateChat = useChatStore.getState().updateChat;
    const updateChat = vi.fn(async (id: string, updates: Partial<GroupChat>) => {
      useChatStore.setState((state) => ({
        chats: state.chats.map((item) => item.id === id ? { ...item, ...updates } : item),
      }));
    });
    useChatStore.setState({
      chats: [chat('chat-worldcup', '最新世界杯动态查询', 'assistant')],
      updateChat,
    });

    try {
      const result = await executeAppCommandRoute({
        mode: 'local_action',
        action: 'rename_chat',
        riskLevel: 'medium',
        requiresConfirmation: false,
        plan: { action: 'rename_chat', chatId: 'chat-worldcup', newName: '世界杯消息' },
      }, context());

      expect(result.status).toBe('success');
      expect(updateChat).toHaveBeenCalledWith('chat-worldcup', { name: '世界杯消息' });
    } finally {
      useChatStore.setState({ chats: [], updateChat: originalUpdateChat });
    }
  });

  it('returns executable chat choices for ambiguous destructive chat actions', async () => {
    const originalDeleteChat = useChatStore.getState().deleteChat;
    const deleteChat = vi.fn(async () => undefined);
    useChatStore.setState({
      chats: [chat('chat-a', '赛博茶馆'), chat('chat-b', '赛博茶馆故事会')],
      deleteChat,
    });

    try {
      const result = await executeAppCommandRoute({
        mode: 'local_action',
        action: 'delete_chats',
        riskLevel: 'medium',
        requiresConfirmation: false,
        plan: { action: 'delete_chats', chatQuery: '赛博茶馆', chatTypePreference: 'group' },
      }, context());

      expect(result.status).toBe('needs_confirmation');
      expect(deleteChat).not.toHaveBeenCalled();
      expect(result.choices?.[0]).toMatchObject({
        kind: 'execute',
        plan: {
          action: 'delete_chats',
          plan: {
            action: 'delete_chats',
            chatId: 'chat-a',
          },
        },
      });
      expect(result.choices?.[0].url).toBeUndefined();
    } finally {
      useChatStore.setState({ chats: [], deleteChat: originalDeleteChat });
    }
  });
});
