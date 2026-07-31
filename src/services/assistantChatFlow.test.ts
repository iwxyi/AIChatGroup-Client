import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantAgentPatchSet } from '../types/assistantArtifact';
import type { Message } from '../types/message';
import type { GroupChat } from '../types/chat';
import { useChatStore } from '../stores/useChatStore';
import { buildAssistantChatDraft } from './chatDraftBuilder';
import { generateResponse } from './aiClient';
import { buildAgentArtifactReplyContent, markAssistantMediaAttachmentsFailed, maybeGenerateAssistantChatTitle, runAssistantChatReplyFlow } from './assistantChatFlow';

vi.mock('./aiClient', () => ({
  generateResponse: vi.fn(),
}));

const generateResponseMock = vi.mocked(generateResponse);

function assistantChat(id = 'assistant-chat-1'): GroupChat {
  return {
    ...buildAssistantChatDraft(),
    id,
    createdAt: 1000,
    updatedAt: 1000,
    lastMessageAt: 1000,
  };
}

beforeEach(() => {
  generateResponseMock.mockReset();
  useChatStore.setState({ chats: [] });
});

describe('assistantChatFlow media artifacts', () => {
  it('passes the latest uploaded image to a vision-capable GPT text model', async () => {
    const chat = assistantChat();
    const userMessage: Message = {
      id: 'message-user-image',
      chatId: chat.id,
      type: 'user',
      senderId: 'user',
      senderName: '我',
      content: '请解释这张图片',
      emotion: 0,
      timestamp: 1001,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'uploaded-image',
          kind: 'image',
          status: 'ready',
          altText: '用户上传的图片',
          mimeType: 'image/png',
          url: 'data:image/png;base64,AAA',
          createdAt: 1001,
          updatedAt: 1001,
        }],
      },
    };
    generateResponseMock.mockResolvedValue('这是一张图片。');

    await runAssistantChatReplyFlow({
      api: { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.4-mini' },
      aiProfiles: [{
        id: 'gpt-text',
        name: 'GPT',
        type: 'text',
        provider: 'openai',
        apiKey: 'k',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.4-mini',
        isDefault: true,
      }],
      chat,
      chatId: chat.id,
      currentMessages: [userMessage],
      upsertMessage: vi.fn(),
      updateChat: vi.fn(async () => undefined),
    });

    const projected = generateResponseMock.mock.calls[0]?.[2] as Array<{
      content: string;
      attachments?: Array<{ url: string; mimeType?: string }>;
    }>;
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      content: expect.stringContaining('请解释这张图片'),
      attachments: [{ url: 'data:image/png;base64,AAA', mimeType: 'image/png' }],
    });
  });

  it('passes uploaded images through the official GPT provider even when the model alias is provider-like', async () => {
    const chat = assistantChat();
    const userMessage: Message = {
      id: 'message-user-official-image',
      chatId: chat.id,
      type: 'user',
      senderId: 'user',
      senderName: '我',
      content: '解释这张参考图',
      emotion: 0,
      timestamp: 1001,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'uploaded-image',
          kind: 'image',
          status: 'ready',
          altText: '参考图',
          mimeType: 'image/png',
          url: 'data:image/png;base64,AAA',
          createdAt: 1001,
          updatedAt: 1001,
        }],
      },
    };
    generateResponseMock.mockResolvedValue('我看到了图片内容。');

    await runAssistantChatReplyFlow({
      api: { provider: 'official-2', apiKey: '', baseUrl: '/api/ai', model: 'official-2' },
      aiProfiles: [{
        id: 'official-gpt',
        name: '官方2',
        type: 'text',
        provider: 'official-2',
        apiKey: '',
        baseUrl: '/api/ai',
        model: 'official-2',
        isDefault: true,
      }],
      chat,
      chatId: chat.id,
      currentMessages: [userMessage],
      upsertMessage: vi.fn(),
      updateChat: vi.fn(async () => undefined),
    });

    const projected = generateResponseMock.mock.calls[0]?.[2] as Array<{
      attachments?: Array<{ url: string; mimeType?: string }>;
    }>;
    expect(projected[0]?.attachments).toEqual([{ url: 'data:image/png;base64,AAA', mimeType: 'image/png' }]);
  });

  it('does not pretend to see uploaded images when text image input is disabled', async () => {
    const chat = assistantChat();
    const userMessage: Message = {
      id: 'message-user-image-disabled',
      chatId: chat.id,
      type: 'user',
      senderId: 'user',
      senderName: '我',
      content: '请解释这张图片',
      emotion: 0,
      timestamp: 1001,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'uploaded-image',
          kind: 'image',
          status: 'ready',
          altText: '捕获.PNG',
          mimeType: 'image/png',
          url: 'data:image/png;base64,AAA',
          sizeBytes: 3000,
          createdAt: 1001,
          updatedAt: 1001,
        }],
      },
    };
    generateResponseMock.mockResolvedValue('当前模型未收到可解析的图片输入。');

    await runAssistantChatReplyFlow({
      api: { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.4-mini' },
      aiProfiles: [{
        id: 'gpt-text',
        name: 'GPT',
        type: 'text',
        provider: 'openai',
        apiKey: 'k',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.4-mini',
        isDefault: true,
        inputCapabilities: { imageInput: false, multiImageInput: false },
      }],
      chat,
      chatId: chat.id,
      currentMessages: [userMessage],
      upsertMessage: vi.fn(),
      updateChat: vi.fn(async () => undefined),
    });

    const systemPrompt = String(generateResponseMock.mock.calls[0]?.[1] || '');
    const projected = generateResponseMock.mock.calls[0]?.[2] as Array<{
      content: string;
      attachments?: Array<{ url: string; mimeType?: string }>;
    }>;
    expect(systemPrompt).toContain('当前文本模型请求没有携带可视觉解析的图片输入');
    expect(projected[0]?.content).toContain('[图片附件：捕获.PNG]');
    expect(projected[0]?.attachments).toBeUndefined();
  });

  it('does not append the same Mermaid artifact twice when the writer already included it inline', () => {
    const mermaid = [
      'flowchart TD',
      '    A[父亲] -->|夫妻| B[母亲]',
      '    A -->|父子| C[儿子]',
      '    B -->|母子| C',
      '    C -->|夫妻| D[儿媳]',
      '    C -->|父子| E[孙子]',
      '    D -->|母子| E',
    ].join('\n');
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: [
        '这是一个简单的角色关系图示例。',
        '',
        '```mermaid',
        mermaid,
        '```',
      ].join('\n'),
      patches: [{
        action: 'create',
        kind: 'diagram',
        title: '角色关系图 (Mermaid)',
        language: 'mermaid',
        content: mermaid,
      }],
      mediaTasks: [],
    };

    const content = buildAgentArtifactReplyContent(patchSet);

    expect(content.match(/```mermaid/g)?.length).toBe(1);
    expect(content).not.toContain('## 角色关系图 (Mermaid)');
  });

  it('appends artifact content when the assistant message only contains a short summary', () => {
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '已为你整理好角色关系图。',
      patches: [{
        action: 'create',
        kind: 'diagram',
        title: '角色关系图',
        language: 'mermaid',
        content: 'flowchart TD\n    A[秦始皇] -->|任用| B[李斯]\n    A -->|防范| C[赵高]',
      }],
      mediaTasks: [],
    };

    expect(buildAgentArtifactReplyContent(patchSet)).toContain('```mermaid');
  });

  it('keeps the user-facing assistant message separate from image prompts', () => {
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '我为你生成一张红烧肉照片，肥瘦相间、酱色油亮，适合直接查看。',
      patches: [],
      mediaTasks: [{
        kind: 'image',
        prompt: 'A realistic photo of Chinese braised pork belly, glossy soy caramel sauce, food photography',
        altText: '红烧肉照片',
      }],
    };

    expect(buildAgentArtifactReplyContent(patchSet)).toBe('我为你生成一张红烧肉照片，肥瘦相间、酱色油亮，适合直接查看。');
  });

  it('marks pending assistant media attachments as failed when media processing aborts unexpectedly', () => {
    const message: Message = {
      id: 'message-1',
      chatId: 'chat-1',
      type: 'ai',
      senderId: 'assistant',
      senderName: '助手',
      content: '正在生成图片，完成后会自动显示。',
      emotion: 0,
      timestamp: 1000,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'image-1',
          kind: 'image',
          status: 'queued',
          altText: '红烧肉照片',
          promptText: '红烧肉照片',
          createdAt: 1000,
          updatedAt: 1000,
        }],
        generation: {
          status: 'queued',
          updatedAt: 1000,
        },
      },
    };

    const next = markAssistantMediaAttachmentsFailed(message, new Error('生成服务异常'));

    expect(next.metadata?.attachments?.[0]).toMatchObject({
      id: 'image-1',
      status: 'failed',
      error: '生成服务异常',
    });
    expect(next.metadata?.generation?.status).toBe('failed');
  });
});

describe('assistantChatFlow title generation', () => {
  it('renames default assistant chats from AI using user and assistant context', async () => {
    const chat = assistantChat();
    const updateChat = vi.fn(async () => undefined);
    const messages: Message[] = [
      {
        id: 'message-user',
        chatId: chat.id,
        type: 'user',
        senderId: 'user',
        senderName: '我',
        content: '查一下最新世界杯消息',
        emotion: 0,
        timestamp: 1001,
        isDeleted: false,
      },
      {
        id: 'message-ai',
        chatId: chat.id,
        type: 'ai',
        senderId: 'assistant',
        senderName: '助手',
        content: '这里是搜索到的世界杯最新动态摘要。',
        emotion: 0,
        timestamp: 1002,
        isDeleted: false,
      },
    ];
    useChatStore.setState({ chats: [chat] });
    generateResponseMock.mockResolvedValue('世界杯动态查询');

    await maybeGenerateAssistantChatTitle({
      api: { provider: 'official', apiKey: '', baseUrl: '/api/ai', model: 'official-1' },
      chat,
      chatId: chat.id,
      currentMessages: messages,
      updateChat,
    });

    expect(generateResponseMock).toHaveBeenCalledTimes(1);
    expect(String((generateResponseMock.mock.calls[0]?.[2] as Array<{ content: string }>)[0]?.content || '')).toContain('助手：这里是搜索到的世界杯最新动态摘要。');
    expect(updateChat).toHaveBeenCalledWith(chat.id, expect.objectContaining({
      name: '世界杯动态查询',
      modeState: expect.objectContaining({
        assistantTitle: expect.objectContaining({
          source: 'ai',
          basisMessageCount: 2,
        }),
      }),
    }));
  });

  it('does not rename assistant chats after a user title is recorded', async () => {
    const chat: GroupChat = {
      ...assistantChat(),
      modeState: {
        ...buildAssistantChatDraft().modeState,
        assistantTitle: { source: 'user', updatedAt: 1000 },
      },
    };
    useChatStore.setState({ chats: [chat] });

    await maybeGenerateAssistantChatTitle({
      api: { provider: 'official', apiKey: '', baseUrl: '/api/ai', model: 'official-1' },
      chat,
      chatId: chat.id,
      currentMessages: [{
        id: 'message-user',
        chatId: chat.id,
        type: 'user',
        senderId: 'user',
        senderName: '我',
        content: '继续',
        emotion: 0,
        timestamp: 1001,
        isDeleted: false,
      }],
      updateChat: vi.fn(async () => undefined),
    });

    expect(generateResponseMock).not.toHaveBeenCalled();
  });
});
