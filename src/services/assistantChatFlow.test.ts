import { describe, expect, it, vi } from 'vitest';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';

const generateResponseMock = vi.fn();
const processRichMessageMediaMock = vi.fn();

vi.mock('./aiClient', () => ({
  generateResponse: generateResponseMock,
}));

vi.mock('./chatCommitMessage', () => ({
  createStreamingLocalMessage: (message: Omit<Message, 'id' | 'timestamp' | 'isDeleted'>, options?: { timestamp?: number }) => ({
    ...message,
    id: `local-message-${options?.timestamp || 1}`,
    timestamp: options?.timestamp || 1,
    isDeleted: false,
  }),
  persistLocalFirstMessage: vi.fn(async ({ message }: { message: Message }) => message),
}));

vi.mock('./messageBranching', () => ({
  attachMessageToActiveBranch: (chat: GroupChat, _messages: Message[], draft: Omit<Message, 'id' | 'timestamp' | 'isDeleted'>) => draft,
}));

vi.mock('./richMessageMedia', () => ({
  processRichMessageMedia: processRichMessageMediaMock,
}));

function assistantChat(overrides: Partial<GroupChat> = {}): GroupChat {
  return {
    id: 'assistant-chat',
    type: 'assistant',
    mode: 'open_chat',
    modeConfig: {},
    modeState: {
      assistantTitle: { source: 'manual', updatedAt: 1, basisMessageCount: 1 },
    },
    name: '红烧肉图片',
    topic: '',
    style: 'free',
    runtimeEvolutionIntensity: 'balanced',
    memberIds: [],
    speed: 1,
    isActive: true,
    allowIntervention: true,
    showRoleActions: true,
    topicSeed: '',
    governance: { ownerCharacterId: null, adminCharacterIds: [], autoModeration: false, allowMute: true, allowPrivateThreads: true },
    dramaRules: { allowCliques: false, allowMockery: false, allowAlliances: true, allowContempt: false },
    worldState: { phase: 'idle', mood: '', focus: '', recentEvent: '', conflictAxes: [] },
    directorControls: { allowSpeakAs: true, allowDirectorMode: true, allowEventInjection: true, allowForcedReply: true },
    createdAt: 1,
    updatedAt: 1,
    lastMessageAt: 1,
    ...overrides,
  } as GroupChat;
}

describe('runAssistantChatReplyFlow', () => {
  it('queues an image attachment for explicit normal assistant image requests', async () => {
    generateResponseMock.mockResolvedValue(JSON.stringify({
      assistantMessage: '我来生成一张红烧肉图片。',
      mediaTasks: [{
        kind: 'image',
        prompt: 'A realistic photo of Chinese red braised pork belly, glossy caramelized sauce, white ceramic plate, warm kitchen lighting',
        altText: '红烧肉',
      }],
    }));
    processRichMessageMediaMock.mockResolvedValue(undefined);
    const upserted: Message[] = [];
    const userMessage: Message = {
      id: 'user-1',
      chatId: 'assistant-chat',
      type: 'user',
      senderId: 'user',
      senderName: '用户',
      content: '发我一张红烧肉的图片',
      emotion: 0,
      isDeleted: false,
      timestamp: 1,
    };
    const { runAssistantChatReplyFlow } = await import('./assistantChatFlow');

    const message = await runAssistantChatReplyFlow({
      api: { provider: 'openai', apiKey: 'key', baseUrl: 'https://api.example.test/v1', model: 'gpt-test' },
      aiProfiles: [],
      chat: assistantChat(),
      chatId: 'assistant-chat',
      currentMessages: [userMessage],
      timestamp: 2,
      upsertMessage: (next) => upserted.push(next),
      updateChat: vi.fn(async () => undefined),
    });

    expect(message.content).toBe('我来生成一张红烧肉图片。');
    expect(message.metadata?.attachments?.[0]).toMatchObject({
      kind: 'image',
      status: 'queued',
      promptText: expect.stringContaining('red braised pork'),
      altText: '红烧肉',
    });
    await vi.waitFor(() => {
      expect(processRichMessageMediaMock).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.objectContaining({ id: message.id }),
        aiProfiles: [],
      }));
    });
    expect(upserted.at(-1)?.metadata?.attachments?.[0]?.status).toBe('queued');
  });
});
