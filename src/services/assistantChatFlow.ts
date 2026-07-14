import type { GroupChat } from '../types/chat';
import type { Message, MessageAttachment, MessageMetadata } from '../types/message';
import type { AssistantAgentPatchSet } from '../types/assistantArtifact';
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
const MAX_ASSISTANT_MEDIA_TASKS = 3;
const pendingAssistantTitleChatIds = new Set<string>();

type AssistantMediaTask = NonNullable<AssistantAgentPatchSet['mediaTasks']>[number];

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

function buildAssistantStructuredSystemPrompt() {
  return [
    buildAssistantSystemPrompt(),
    '',
    '必须只输出严格 JSON，不要 Markdown 围栏，不要解释。',
    '输出格式：{"assistantMessage":"面向用户的回复，支持 Markdown","mediaTasks":[{"kind":"image","prompt":"给图片模型的完整提示词","altText":"图片标题或替代文本","referenceImages":[{"url":"data:image/png;base64,... 或 https://...","mimeType":"image/png","label":"参考图"}]}]}',
    '规则：',
    '1. 用户明确要求生成、发送、画、做一张图片/照片/插画/图像时，mediaTasks 必须包含 image 任务；不要回答“无法直接发送图片”。',
    '2. 图片由独立图片模型生成。assistantMessage 应简短说明正在生成或已加入生成队列，不要伪造图片 URL、base64 或 Markdown 图片链接。',
    '3. 用户只是普通问答、资料查询、写作、解释或代码请求时，mediaTasks 为空，assistantMessage 给出完整回答。',
    '4. 图片 prompt 要具体、可执行，保留用户主体、风格、构图、材质、光线和限制；避免水印、文字叠加、URL、品牌侵权或无法执行的要求。',
    '5. 如用户要求局部编辑、蒙版修改或指定区域修改，但没有明确可用区域标注，说明当前只能参考原图重新生成整体变体。',
  ].join('\n');
}

function isAssistantAgentArtifactEnabled(chat: GroupChat) {
  return Boolean(chat.modeState.assistantCapabilities?.agent && chat.modeState.assistantCapabilities?.artifacts);
}

function createAssistantMediaAttachments(patchSet: AssistantAgentPatchSet, timestamp: number): MessageAttachment[] {
  return (patchSet.mediaTasks || []).map((task, index) => ({
    id: `assistant-image-${timestamp}-${index + 1}`,
    kind: 'image',
    status: 'queued',
    promptText: task.prompt,
    altText: task.altText || 'AI 图片',
    referenceImages: task.referenceImages,
    createdAt: timestamp + index,
    updatedAt: timestamp + index,
  }));
}

function textField(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    const match = /\{[\s\S]*\}/.exec(value);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function normalizeAssistantMediaTasks(value: unknown): AssistantMediaTask[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ASSISTANT_MEDIA_TASKS).flatMap((item): AssistantMediaTask[] => {
    if (!isRecord(item) || item.kind !== 'image') return [];
    const prompt = textField(item.prompt, 4000);
    if (!prompt) return [];
    const referenceImages = Array.isArray(item.referenceImages)
      ? item.referenceImages.slice(0, 8).flatMap((entry): NonNullable<AssistantMediaTask['referenceImages']> => {
          if (!isRecord(entry)) return [];
          const url = textField(entry.url, 12_000);
          if (!url || (!url.startsWith('data:image/') && !/^https?:\/\//i.test(url))) return [];
          return [{
            url,
            mimeType: textField(entry.mimeType, 120) || undefined,
            label: textField(entry.label, 160) || undefined,
          }];
        })
      : undefined;
    return [{
      kind: 'image',
      prompt,
      altText: textField(item.altText, 160) || textField(item.title, 160) || 'AI 图片',
      referenceImages: referenceImages?.length ? referenceImages : undefined,
    }];
  });
}

function normalizeAssistantStructuredReply(raw: string): Pick<AssistantAgentPatchSet, 'assistantMessage' | 'mediaTasks'> {
  const parsed = parseJsonObject(raw);
  if (!isRecord(parsed)) {
    return { assistantMessage: raw.trim(), mediaTasks: [] };
  }
  const mediaTasks = normalizeAssistantMediaTasks(parsed.mediaTasks);
  return {
    assistantMessage: textField(parsed.assistantMessage, 8000) || (mediaTasks.length ? '图片已加入生成队列。' : ''),
    mediaTasks,
  };
}

async function processAssistantMediaAttachments(params: {
  message: Message;
  aiProfiles: AIModelProfile[];
  upsertMessage: (message: Message) => void;
}) {
  if (!params.message.metadata?.attachments?.some((attachment) => attachment.status === 'queued')) return;
  const { processRichMessageMedia } = await import('./richMessageMedia');
  await processRichMessageMedia({
    message: params.message,
    character: null,
    characters: [],
    aiProfiles: params.aiProfiles,
    upsertMessage: params.upsertMessage,
  });
}

async function persistAssistantArtifactsFromReply(params: {
  chat: GroupChat;
  chatId: string;
  userMessage: Message;
  messages: Message[];
  timestamp?: number;
  upsertMessage: (message: Message) => void;
  updateChat: (id: string, patch: Partial<GroupChat>) => Promise<void>;
  api: APIConfig;
  aiProfiles: AIModelProfile[];
  signal?: AbortSignal;
}) {
  if (!isAssistantAgentArtifactEnabled(params.chat)) return null;
  const [
    { planAssistantAgentChange, writeAssistantAgentPatchSet },
    { ensureAssistantArtifactStoreHydrated, useAssistantArtifactStore },
  ] = await Promise.all([
    import('./assistantAgentOrchestrator'),
    import('../stores/useAssistantArtifactStore'),
  ]);
  await ensureAssistantArtifactStoreHydrated();
  const existingArtifacts = useAssistantArtifactStore.getState().getArtifactsForChat(params.chatId);
  const plan = await planAssistantAgentChange({
    api: params.api,
    chatId: params.chatId,
    messages: params.messages,
    userMessage: params.userMessage,
    existingArtifacts,
    signal: params.signal,
  });
  if (plan.intent === 'chat' && plan.assistantMessage?.trim()) {
    const assistantMessage = await persistAssistantFinalMessage({
      chat: params.chat,
      chatId: params.chatId,
      currentMessages: params.messages,
      content: plan.assistantMessage.trim(),
      timestamp: params.timestamp,
      upsertMessage: params.upsertMessage,
    });
    await params.updateChat(params.chatId, {
      lastMessageAt: assistantMessage.timestamp,
      latestMessage: assistantMessage,
    });
    return { message: assistantMessage, patchesCommitted: 0 };
  }
  if (plan.intent === 'chat') return null;

  let content = plan.clarificationQuestion || '我需要先确认要处理哪个产物。';
  let patchesCommitted = 0;
  if (plan.intent === 'create' || plan.intent === 'update') {
    const patchSet = await writeAssistantAgentPatchSet({
      api: params.api,
      chatId: params.chatId,
      messages: params.messages,
      userMessage: params.userMessage,
      plan,
      existingArtifacts,
      signal: params.signal,
    });
    content = buildAgentArtifactReplyContent(patchSet);
    const attachments = createAssistantMediaAttachments(patchSet, params.timestamp || Date.now());
    if (patchSet.patches.length) {
      patchesCommitted = patchSet.patches.length;
    }
    if (!patchSet.patches.length && !attachments.length && !content.trim()) {
      content = '我没有得到可安全提交的产物变更。';
    }
    const assistantMessage = await persistAssistantFinalMessage({
      chat: params.chat,
      chatId: params.chatId,
      currentMessages: params.messages,
      content,
      metadata: attachments.length ? {
        attachments,
        generation: {
          status: 'queued',
          updatedAt: Date.now(),
        },
      } : undefined,
      timestamp: params.timestamp,
      upsertMessage: params.upsertMessage,
    });
    if (attachments.length) {
      void processAssistantMediaAttachments({
        message: assistantMessage,
        aiProfiles: params.aiProfiles,
        upsertMessage: params.upsertMessage,
      }).catch(() => undefined);
    }
    if (patchSet.patches.length) {
      const changedArtifacts = useAssistantArtifactStore.getState().commitPatchSet({
        chatId: params.chatId,
        messageId: assistantMessage.id,
        patches: patchSet.patches,
        timestamp: assistantMessage.timestamp,
      });
      if (changedArtifacts.length) {
        const messageWithArtifacts = await persistLocalFirstMessage({
          message: {
            ...assistantMessage,
            metadata: {
              ...(assistantMessage.metadata || {}),
              assistant: {
                ...(assistantMessage.metadata?.assistant || {}),
                artifacts: changedArtifacts.map((artifact) => ({
                  id: artifact.id,
                  kind: artifact.kind,
                  title: artifact.title,
                })),
              },
            },
          },
          existingLocalMessage: assistantMessage,
          upsertMessage: params.upsertMessage,
        });
        await params.updateChat(params.chatId, {
          lastMessageAt: messageWithArtifacts.timestamp,
          latestMessage: messageWithArtifacts,
        });
        return { message: messageWithArtifacts, patchesCommitted };
      }
    }
    await params.updateChat(params.chatId, {
      lastMessageAt: assistantMessage.timestamp,
      latestMessage: assistantMessage,
    });
    return { message: assistantMessage, patchesCommitted };
  }

  const assistantMessage = await persistAssistantFinalMessage({
    chat: params.chat,
    chatId: params.chatId,
    currentMessages: params.messages,
    content,
    timestamp: params.timestamp,
    upsertMessage: params.upsertMessage,
  });
  await params.updateChat(params.chatId, {
    lastMessageAt: assistantMessage.timestamp,
    latestMessage: assistantMessage,
  });
  return { message: assistantMessage, patchesCommitted };
}

function artifactFenceLanguage(patch: AssistantAgentPatchSet['patches'][number]) {
  if (patch.language) return patch.language;
  if (patch.kind === 'diagram') return 'mermaid';
  if (patch.kind === 'html') return 'html';
  if (patch.kind === 'json') return 'json';
  if (patch.kind === 'table') return 'csv';
  return 'text';
}

function formatPatchForBubble(patch: AssistantAgentPatchSet['patches'][number]) {
  if (patch.kind === 'document') return `\n\n## ${patch.title}\n\n${patch.content}`;
  if (patch.files?.length) {
    return patch.files.map((file) => [
      `\n\n### ${file.path}`,
      `\`\`\`${file.language || artifactFenceLanguage(patch)}`,
      file.content,
      '```',
    ].join('\n')).join('');
  }
  return [
    `\n\n## ${patch.title}`,
    `\`\`\`${artifactFenceLanguage(patch)}`,
    patch.content,
    '```',
  ].join('\n');
}

function buildAgentArtifactReplyContent(patchSet: AssistantAgentPatchSet) {
  const intro = patchSet.assistantMessage.trim() || '已完成产物变更。';
  const visiblePatches = patchSet.patches.filter((patch) => patch.content || patch.files?.length).slice(0, 3);
  if (!visiblePatches.length && patchSet.mediaTasks?.length) return intro || '图片已加入生成队列。';
  if (!visiblePatches.length) return intro;
  return `${intro}${visiblePatches.map(formatPatchForBubble).join('')}`;
}

async function persistAssistantFinalMessage(params: {
  chat: GroupChat;
  chatId: string;
  currentMessages: Message[];
  content: string;
  metadata?: Partial<MessageMetadata>;
  timestamp?: number;
  upsertMessage: (message: Message) => void;
}) {
  const assistantDraft: Omit<Message, 'id' | 'timestamp' | 'isDeleted'> = {
    chatId: params.chatId,
    type: 'ai',
    senderId: 'assistant',
    senderName: '助手',
    content: params.content,
    emotion: 0,
    metadata: {
      format: 'markdown',
      assistant: {
        mode: 'general',
      },
      ...(params.metadata || {}),
    },
  };
  const localMessage = createStreamingLocalMessage(
    attachMessageToActiveBranch(params.chat, params.currentMessages, assistantDraft) as Omit<Message, 'id' | 'timestamp' | 'isDeleted'>,
    { timestamp: params.timestamp },
  );
  params.upsertMessage(localMessage);
  return persistLocalFirstMessage({
    message: localMessage,
    existingLocalMessage: localMessage,
    upsertMessage: params.upsertMessage,
  });
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

function latestUserMessage(messages: Message[]) {
  return [...messages]
    .reverse()
    .find((message) => (
      !message.isDeleted
      && (message.type === 'user' || message.type === 'god')
      && message.content.trim()
    )) || null;
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
  if (isAssistantAgentArtifactEnabled(params.chat)) {
    const userMessage = latestUserMessage(params.currentMessages);
    if (userMessage) {
      const agentResult = await persistAssistantArtifactsFromReply({
        chat: params.chat,
        chatId: params.chatId,
        userMessage,
        messages: params.currentMessages,
        timestamp: params.timestamp,
        upsertMessage: params.upsertMessage,
        updateChat: params.updateChat,
        api: resolvedApi,
        aiProfiles: params.aiProfiles,
        signal: params.signal,
      });
      if (agentResult?.message) return agentResult.message;
    }
  }
  const generated = await generateResponse(
    resolvedApi,
    buildAssistantStructuredSystemPrompt(),
    toAssistantPromptMessages(params.currentMessages),
    undefined,
    {
      responseFormat: 'json',
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
  const structuredReply = normalizeAssistantStructuredReply(generated);
  const attachments = createAssistantMediaAttachments({
    assistantMessage: structuredReply.assistantMessage,
    patches: [],
    mediaTasks: structuredReply.mediaTasks,
  }, params.timestamp || Date.now());
  const content = structuredReply.assistantMessage.trim() || (attachments.length ? '图片已加入生成队列。' : '');
  if (!content) throw new Error('助手没有生成有效内容');
  const persisted = await persistAssistantFinalMessage({
    chat: params.chat,
    chatId: params.chatId,
    currentMessages: params.currentMessages,
    upsertMessage: params.upsertMessage,
    content,
    metadata: attachments.length ? {
      attachments,
      generation: {
        status: 'queued',
        updatedAt: Date.now(),
      },
    } : undefined,
    timestamp: params.timestamp,
  });
  if (attachments.length) {
    void processAssistantMediaAttachments({
      message: persisted,
      aiProfiles: params.aiProfiles,
      upsertMessage: params.upsertMessage,
    }).catch(() => undefined);
  }
  await params.updateChat(params.chatId, {
    lastMessageAt: persisted.timestamp,
    latestMessage: persisted,
  });
  return persisted;
}
