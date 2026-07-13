import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import type { APIConfig, AIModelProfile } from '../types/settings';
import { getUsablePreferredAIProfile } from '../types/settings';
import { createStreamingLocalMessage, persistLocalFirstMessage } from './chatCommitMessage';
import { generateResponse } from './aiClient';
import { GenerationCancelledError } from './generationCancellation';
import { attachMessageToActiveBranch } from './messageBranching';
import { useChatStore } from '../stores/useChatStore';

const MAX_ASSISTANT_HISTORY = 24;
const MAX_ASSISTANT_TITLE_CONTEXT = 12;
const DEFAULT_ASSISTANT_CHAT_NAME = '新助手会话';
const MAX_GENERATED_TITLE_LENGTH = 28;
const pendingAssistantTitleChatIds = new Set<string>();

function ensureAssistantReplyStillCurrent(params: { signal?: AbortSignal; shouldContinue?: () => boolean }) {
  if (params.signal?.aborted) throw new GenerationCancelledError();
  if (params.shouldContinue && !params.shouldContinue()) throw new GenerationCancelledError('助手回复所属分支已切换');
}

function resolveTextApiConfig(fallback: APIConfig, aiProfiles: AIModelProfile[]) {
  const profile = getUsablePreferredAIProfile(aiProfiles, 'text');
  if (!profile) return fallback;
  return {
    provider: profile.provider,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
  } satisfies APIConfig;
}

function buildAssistantSystemPrompt() {
  return [
    '你是通用 AI 助手。',
    '优先准确、清晰、客观地回答用户问题，不要扮演角色，不要使用虚构人物口吻。',
    '如果问题缺少必要信息，先说明不确定性，再给出可执行的下一步。',
    '如果用户要求最新资料或实时事实，而当前没有检索结果，请明确说明需要联网检索或外部来源确认。',
    '可以使用 Markdown 组织答案，但不要为了形式而过度结构化。',
  ].join('\n');
}

function toAssistantPromptMessages(messages: Message[]) {
  return messages
    .filter((message) => !message.isDeleted && message.type !== 'system' && message.type !== 'event')
    .slice(-MAX_ASSISTANT_HISTORY)
    .map((message) => ({
      role: message.type === 'ai' ? 'assistant' as const : 'user' as const,
      content: message.content,
    }))
    .filter((message) => message.content.trim());
}

function getTitleSource(chat: GroupChat) {
  return chat.modeState?.assistantTitle?.source;
}

function getAssistantTitleContext(messages: Message[]) {
  return messages
    .filter((message) => (
      !message.isDeleted
      && message.type !== 'system'
      && message.type !== 'event'
      && message.content.trim()
    ))
    .slice(-MAX_ASSISTANT_TITLE_CONTEXT);
}

function hasUserMessage(messages: Message[]) {
  const userMessages = messages.filter((message) => (
    !message.isDeleted
    && (message.type === 'user' || message.type === 'god')
    && message.content.trim()
  ));
  return userMessages.length > 0;
}

function formatTitleContext(messages: Message[]) {
  return messages
    .map((message) => {
      const role = message.type === 'ai' ? '助手' : '用户';
      return `${role}：${message.content.trim()}`;
    })
    .join('\n\n');
}

function isDefaultAssistantChatName(name?: string) {
  const normalized = (name || '').trim();
  return !normalized || normalized === DEFAULT_ASSISTANT_CHAT_NAME;
}

function sanitizeGeneratedTitle(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .split(/\r?\n/)[0]
    .replace(/^#+\s*/, '')
    .replace(/^["'“”‘’「」《》【】\s]+|["'“”‘’「」《》【】\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_GENERATED_TITLE_LENGTH);
}

async function maybeGenerateAssistantChatTitle(params: {
  api: APIConfig;
  chat: GroupChat;
  chatId: string;
  currentMessages: Message[];
  updateChat: (id: string, patch: Partial<GroupChat>) => Promise<void>;
}) {
  if (params.chat.type !== 'assistant') return;
  if (getTitleSource(params.chat)) return;
  if (!isDefaultAssistantChatName(params.chat.name)) return;
  if (!hasUserMessage(params.currentMessages)) return;
  if (pendingAssistantTitleChatIds.has(params.chatId)) return;
  const titleContext = getAssistantTitleContext(params.currentMessages);
  if (!titleContext.length) return;

  pendingAssistantTitleChatIds.add(params.chatId);
  try {
    const generated = await generateResponse(
      params.api,
      [
        '你是会话标题生成器。',
        '根据下面的助手会话记录生成一个简短、客观的中文会话标题。',
        '只输出标题本身，不要解释，不要使用 Markdown，不要加引号。',
        `标题最多 ${MAX_GENERATED_TITLE_LENGTH} 个字符。`,
      ].join('\n'),
      [{ role: 'user', content: formatTitleContext(titleContext) }],
      undefined,
      {
        responseFormat: 'text',
        maxTokens: 48,
        aiUsage: {
          type: 'assistant_chat',
          label: '助手会话命名',
          scope: 'chat',
          resourceId: params.chatId,
        },
      },
    );
    const title = sanitizeGeneratedTitle(generated);
    if (!title) return;
    const latestChat = useChatStore.getState().chats.find((item) => item.id === params.chatId);
    if (!latestChat || latestChat.type !== 'assistant') return;
    if (getTitleSource(latestChat) || !isDefaultAssistantChatName(latestChat.name)) return;
    await params.updateChat(params.chatId, {
      name: title,
      modeState: {
        ...latestChat.modeState,
        assistantTitle: {
          source: 'ai',
          updatedAt: Date.now(),
          basisMessageCount: titleContext.length,
        },
      },
    });
  } catch (error) {
    console.warn('[assistant-title:auto-generate-failed]', error);
  } finally {
    pendingAssistantTitleChatIds.delete(params.chatId);
  }
}

export async function runAssistantChatReplyFlow(params: {
  api: APIConfig;
  aiProfiles: AIModelProfile[];
  chat: GroupChat;
  chatId: string;
  currentMessages: Message[];
  timestamp?: number;
  upsertMessage: (message: Message) => void;
  updateChat: (id: string, patch: Partial<GroupChat>) => Promise<void>;
  signal?: AbortSignal;
  shouldContinue?: () => boolean;
}) {
  ensureAssistantReplyStillCurrent(params);
  const resolvedApi = resolveTextApiConfig(params.api, params.aiProfiles);
  void maybeGenerateAssistantChatTitle({
    api: resolvedApi,
    chat: params.chat,
    chatId: params.chatId,
    currentMessages: params.currentMessages,
    updateChat: params.updateChat,
  });
  const assistantDraft: Omit<Message, 'id' | 'timestamp' | 'isDeleted'> = {
    chatId: params.chatId,
    type: 'ai',
    senderId: 'assistant',
    senderName: '助手',
    content: '',
    emotion: 0,
    metadata: {
      format: 'markdown',
      assistant: {
        mode: 'general',
      },
    },
  };
  const placeholder = createStreamingLocalMessage(
    attachMessageToActiveBranch(params.chat, params.currentMessages, assistantDraft) as Omit<Message, 'id' | 'timestamp' | 'isDeleted'>,
    { timestamp: params.timestamp },
  );
  let streamingMessage = { ...placeholder, isStreaming: true };
  params.upsertMessage(streamingMessage);

  const generated = await generateResponse(
    resolvedApi,
    buildAssistantSystemPrompt(),
    toAssistantPromptMessages(params.currentMessages),
    (content) => {
      ensureAssistantReplyStillCurrent(params);
      streamingMessage = { ...streamingMessage, content, isStreaming: true };
      params.upsertMessage(streamingMessage);
    },
    {
      responseFormat: 'text',
      signal: params.signal,
      aiUsage: {
        type: 'assistant_chat',
        label: '助手回复',
        scope: 'chat',
        resourceId: params.chatId,
      },
    },
  );
  ensureAssistantReplyStillCurrent(params);
  const content = generated.trim();
  if (!content) throw new Error('助手没有生成有效内容');
  const persisted = await persistLocalFirstMessage({
    message: {
      ...streamingMessage,
      content,
      isStreaming: false,
    },
    existingLocalMessage: streamingMessage,
    upsertMessage: params.upsertMessage,
  });
  await params.updateChat(params.chatId, {
    lastMessageAt: persisted.timestamp,
    latestMessage: persisted,
  });
  return persisted;
}
