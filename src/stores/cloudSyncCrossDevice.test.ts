import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageKey } from '../constants/brand';
import {
  DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
  DEFAULT_CONVERSATION_DRAMA_RULES,
  DEFAULT_CONVERSATION_GOVERNANCE,
  DEFAULT_CONVERSATION_WORLD_STATE,
  DEFAULT_OPEN_CHAT_MODE_CONFIG,
  DEFAULT_OPEN_CHAT_MODE_STATE,
  type GroupChat,
} from '../types/chat';
import type { Message } from '../types/message';

const apiMocks = vi.hoisted(() => ({
  getSyncChanges: vi.fn(),
  getMessages: vi.fn(),
  getChats: vi.fn(),
  getWorldRuntimeChats: vi.fn(),
  getDeletedChats: vi.fn(),
  createChat: vi.fn(),
  syncChatPatch: vi.fn(),
  purgeChat: vi.fn(),
  bulkPurgeChats: vi.fn(),
  emptyDeletedChats: vi.fn(),
  createMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {
    code?: string;
    status?: number;

    constructor(message: string, options?: { code?: string; status?: number }) {
      super(message);
      this.name = 'ApiError';
      this.code = options?.code;
      this.status = options?.status;
    }
  },
  api: apiMocks,
}));

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
}

function createDeviceStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function installCloudDeviceStorage(storage: StorageLike) {
  vi.stubGlobal('localStorage', storage);
  const user = {
    id: 'user-cross-device',
    phone: '19900000000',
    nickname: '测试用户',
    avatar: '',
    cloudSyncEntitled: true,
    agentEntitled: true,
  };
  localStorage.setItem(storageKey('auth-mode'), 'cloud');
  localStorage.setItem(storageKey('token'), 'token-cross-device');
  localStorage.setItem(storageKey('user'), JSON.stringify(user));
  localStorage.setItem(storageKey('last-cloud-user-id'), user.id);
  localStorage.setItem(storageKey('cloud-sync-enabled'), '1');
  return user;
}

function buildCloudAuthState(user: ReturnType<typeof installCloudDeviceStorage>) {
  return {
    token: 'token-cross-device',
    user,
    isLoggedIn: true,
    isLoading: false,
    authMode: 'cloud' as const,
  };
}

function buildChat(): GroupChat {
  return {
    id: 'chat-world-cup',
    type: 'assistant',
    mode: 'agent_workflow',
    modeConfig: DEFAULT_OPEN_CHAT_MODE_CONFIG,
    modeState: {
      ...DEFAULT_OPEN_CHAT_MODE_STATE,
      assistantCapabilities: { agent: true, artifacts: true, webSearch: true },
    },
    modeStateSummary: { assistantCapabilities: { agent: true, artifacts: true, webSearch: true } },
    sessionKind: {
      topology: 'direct',
      family: 'agent',
      scenarioId: 'assistant-agent',
      surfaceProfile: 'text',
    },
    name: '最新世界杯动态查询',
    topic: '最新世界杯动态查询',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: ['user', 'assistant'],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    topicSeed: '',
    layeredMemories: [],
    runtimeSeed: { notes: [], artifacts: [] },
    runtimeTimeline: [],
    runtimeEventsV2: [],
    relationshipLedger: [],
    governance: DEFAULT_CONVERSATION_GOVERNANCE,
    dramaRules: DEFAULT_CONVERSATION_DRAMA_RULES,
    worldState: DEFAULT_CONVERSATION_WORLD_STATE,
    directorControls: DEFAULT_CONVERSATION_DIRECTOR_CONTROLS,
    messageBranchState: {
      selectedRevisionByRootId: { 'message-user-image-request': 'message-assistant-image-ready' },
      activeChildByParentNodeId: { 'message-user-image-request': 'message-assistant-image-ready' },
      activeLeafNodeId: 'message-assistant-image-ready',
      updatedAt: 2_000,
    },
    fieldVersions: { messageBranchState: 2_000 },
    createdAt: 1_000,
    updatedAt: 2_000,
    lastMessageAt: 2_000,
  };
}

function buildMessages(chatId: string): Message[] {
  return [
    {
      id: 'message-user-image-request',
      serverId: 'message-user-image-request',
      chatId,
      type: 'user',
      senderId: 'user',
      senderName: '小叉',
      content: '帮我生成3张图片，分别是：番茄炒蛋、番茄炒饭、蛋炒饭',
      emotion: 0,
      timestamp: 1_100,
      isDeleted: false,
    },
    {
      id: 'message-assistant-image-ready',
      serverId: 'message-assistant-image-ready',
      chatId,
      type: 'ai',
      senderId: 'assistant',
      senderName: '助手',
      content: '下面是为您生成的三道美食图片。',
      emotion: 0,
      timestamp: 1_200,
      isDeleted: false,
      metadata: {
        branching: {
          nodeId: 'message-assistant-image-ready',
          parentNodeId: 'message-user-image-request',
          revisionRootId: 'message-user-image-request',
        },
        generation: { status: 'ready', updatedAt: 1_230 },
        attachments: [
          {
            id: 'image-tomato-egg',
            kind: 'image',
            status: 'ready',
            assetId: 'asset-tomato-egg',
            url: '/api/media/assets/asset-tomato-egg',
            mimeType: 'image/png',
            altText: '番茄炒蛋',
            promptText: '番茄炒蛋，餐厅级美食摄影，温暖自然光。',
            createdAt: 1_210,
            updatedAt: 1_230,
          },
          {
            id: 'image-tomato-rice',
            kind: 'image',
            status: 'ready',
            assetId: 'asset-tomato-rice',
            url: '/api/media/assets/asset-tomato-rice',
            mimeType: 'image/png',
            altText: '番茄炒饭',
            promptText: '番茄炒饭，细节丰富的商业美食摄影。',
            createdAt: 1_211,
            updatedAt: 1_231,
          },
        ],
      },
    },
  ];
}

function chatSummaryChange(chat: GroupChat) {
  return {
    entity: 'chat_summary',
    op: 'upsert',
    id: chat.id,
    patch: chat,
  };
}

function messageWindowChange(message: Message) {
  return {
    entity: 'message_window_message',
    op: 'upsert',
    id: message.serverId || message.id,
    patch: {
      serverId: message.serverId || message.id,
      clientKey: message.clientKey,
      chatId: message.chatId,
      type: message.type,
      senderId: message.senderId,
      senderName: message.senderName,
      content: message.content,
      metadata: message.metadata,
      emotion: message.emotion,
      timestamp: message.timestamp,
      isDeleted: message.isDeleted,
    },
  };
}

function installCloudServerSnapshot(chat: GroupChat, messages: Message[]) {
  apiMocks.getSyncChanges.mockImplementation(async ({ scope, since }: { scope: string; since?: string | number | null }) => {
    if (scope === 'chats.summary') {
      return {
        status: 'modified',
        scope,
        cursor: 'chats.summary:rev-1',
        revision: 'chats.summary:rev-1',
        hasMore: false,
        changes: [chatSummaryChange(chat)],
      };
    }
    if (scope === `messages.window:${chat.id}`) {
      return {
        status: 'modified',
        scope,
        cursor: 'messages.window:rev-1',
        revision: 'messages.window:rev-1',
        hasMore: false,
        changes: since === null ? messages.map(messageWindowChange) : [],
      };
    }
    return {
      status: 'not_modified',
      scope,
      cursor: `${scope}:rev-1`,
      revision: `${scope}:rev-1`,
      hasMore: false,
      changes: [],
    };
  });
  apiMocks.getMessages.mockResolvedValue(messages);
  apiMocks.getChats.mockResolvedValue([chat]);
  apiMocks.getWorldRuntimeChats.mockResolvedValue([chat]);
  apiMocks.getDeletedChats.mockResolvedValue([]);
}

describe('cloud sync cross-device recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('restores chat agent capabilities, branch state, and rich media messages on a cold second device', async () => {
    const chatFromDeviceA = buildChat();
    const messagesFromDeviceA = buildMessages(chatFromDeviceA.id);
    installCloudServerSnapshot(chatFromDeviceA, messagesFromDeviceA);

    const deviceBUser = installCloudDeviceStorage(createDeviceStorage());
    const { useAuthStore } = await import('./useAuthStore');
    const { useChatStore } = await import('./useChatStore');
    const { useMessageStore } = await import('./useMessageStore');
    useAuthStore.setState(buildCloudAuthState(deviceBUser));

    await useChatStore.getState().loadChats();
    await useMessageStore.getState().openChatWindow(chatFromDeviceA.id, { limit: 40, revalidate: true });

    const restoredChat = useChatStore.getState().getChat(chatFromDeviceA.id);
    expect(restoredChat?.modeState?.assistantCapabilities?.agent).toBe(true);
    expect(restoredChat?.modeState?.assistantCapabilities?.artifacts).toBe(true);
    expect(restoredChat?.sessionKind?.family).toBe('agent');
    expect(restoredChat?.messageBranchState?.activeLeafNodeId).toBe('message-assistant-image-ready');

    const restoredMessages = useMessageStore.getState().messageWindowsByChatId[chatFromDeviceA.id]?.messages || [];
    expect(restoredMessages.map((message) => message.id)).toEqual([
      'message-user-image-request',
      'message-assistant-image-ready',
    ]);
    expect(restoredMessages[1]?.metadata?.branching?.parentNodeId).toBe('message-user-image-request');
    expect(restoredMessages[1]?.metadata?.attachments?.map((attachment) => attachment.assetId)).toEqual([
      'asset-tomato-egg',
      'asset-tomato-rice',
    ]);
    expect(restoredMessages[1]?.metadata?.attachments?.every((attachment) => attachment.status === 'ready')).toBe(true);
    expect(apiMocks.getSyncChanges).toHaveBeenCalledWith({ scope: 'chats.summary', since: null });
    expect(apiMocks.getSyncChanges).toHaveBeenCalledWith({ scope: `messages.window:${chatFromDeviceA.id}`, since: null });
    expect(apiMocks.getMessages).not.toHaveBeenCalled();
  });
});
