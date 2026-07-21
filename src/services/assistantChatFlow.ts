import type { GroupChat } from '../types/chat';
import type { Message, MessageAttachment, MessageMetadata } from '../types/message';
import type { AssistantAgentLocalFileContext, AssistantAgentPatchSet } from '../types/assistantArtifact';
import type { APIConfig, AIModelProfile } from '../types/settings';
import { getUsablePreferredAIProfile } from '../types/settings';
import { createStreamingLocalMessage, persistLocalFirstMessage } from './chatCommitMessage';
import { generateResponse } from './aiClient';
import { GenerationCancelledError } from './generationCancellation';
import { attachMessageToActiveBranch } from './messageBranching';
import { useChatStore } from '../stores/useChatStore';
import { api, ApiError, type AiSearchResultItem } from './api';

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

function isAssistantAgentArtifactEnabled(chat: GroupChat) {
  return Boolean(chat.modeState.assistantCapabilities?.agent && chat.modeState.assistantCapabilities?.artifacts);
}

function isAssistantAgentSearchEnabled(chat: GroupChat) {
  return Boolean(chat.modeState.assistantCapabilities?.agent && chat.modeState.assistantCapabilities?.webSearch);
}

function formatAssistantSearchResult(item: AiSearchResultItem, index: number) {
  const body = item.summary || item.snippet || '';
  const source = [item.siteName, item.publishedAt].filter(Boolean).join(' / ');
  return [
    `${index + 1}. ${item.title}`,
    `URL: ${item.url}`,
    source ? `Source: ${source}` : '',
    body ? `Excerpt: ${body}` : '',
  ].filter(Boolean).join('\n');
}

function buildAssistantSearchResultPromptBlock(params: {
  query: string;
  providerCode: string;
  pointCost: number;
  results: AiSearchResultItem[];
}) {
  return [
    '## Web Search Result',
    `Query: ${params.query}`,
    `Provider: ${params.providerCode}; charged ${params.pointCost} AI points.`,
    'Live web search results are available below. Use them when relevant; do not say you cannot browse or cannot access current information. Do not invent citations. Prefer concise synthesis over listing every result.',
    params.results.map(formatAssistantSearchResult).join('\n\n') || 'No usable result items were returned.',
  ].join('\n');
}

function buildLocalFilePromptBlock(localFiles: AssistantAgentLocalFileContext[]) {
  return [
    '## Local Workspace Files',
    'The user authorized these local files for this request. Use only the content below; do not claim access to files not listed here.',
    ...localFiles.map((file, index) => [
      `### File ${index + 1}: ${file.path}`,
      `Name: ${file.name}`,
      `MIME: ${file.mimeType || 'unknown'}; sizeBytes: ${file.sizeBytes}; truncated: ${file.truncated}; originalLength: ${file.originalLength}`,
      '```',
      file.content,
      '```',
    ].join('\n')),
  ].join('\n\n');
}

async function generateAssistantLocalFileAnswer(params: {
  api: APIConfig;
  chatId: string;
  userMessage: Message;
  messages: Message[];
  localFiles: AssistantAgentLocalFileContext[];
  signal?: AbortSignal;
}) {
  return generateResponse(
    params.api,
    [
      buildAssistantSystemPrompt(),
      buildLocalFilePromptBlock(params.localFiles),
      'Answer the latest user request using the authorized local file content above. If the provided file content is insufficient or truncated, say what is missing instead of guessing.',
    ].join('\n\n'),
    toAssistantPromptMessages(withLatestUserMessage(params.messages, params.userMessage)),
    undefined,
    {
      responseFormat: 'text',
      signal: params.signal,
      aiUsage: {
        type: 'assistant_chat',
        label: '助手Agent本地文件回答',
        scope: 'chat',
        resourceId: params.chatId,
      },
    },
  );
}

async function generateAssistantSearchAnswer(params: {
  api: APIConfig;
  chatId: string;
  userMessage: Message;
  messages: Message[];
  searchQuery: string;
  signal?: AbortSignal;
}) {
  let searchPromptBlock = '';
  try {
    const response = await api.searchWeb(params.searchQuery, {
      source: 'assistant_agent',
      resourceId: params.chatId,
    });
    searchPromptBlock = buildAssistantSearchResultPromptBlock({
      query: response.query,
      providerCode: response.providerCode,
      pointCost: response.pointCost,
      results: response.results,
    });
  } catch (error) {
    const expectedSkip = error instanceof ApiError && (
      error.code === 'AI_SEARCH_ENTITLEMENT_REQUIRED'
      || error.code === 'AI_SEARCH_PROVIDER_UNAVAILABLE'
      || error.code === 'AI_SEARCH_POINTS_INSUFFICIENT'
      || error.status === 401
    );
    searchPromptBlock = [
      '## Web Search Result',
      `Query: ${params.searchQuery}`,
      `Search failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      expectedSkip
        ? 'Tell the user the search could not be performed because the capability, provider, account, or points are unavailable. Do not invent current facts.'
        : 'Tell the user the search failed and answer only from stable knowledge if possible. Do not invent current facts.',
    ].join('\n');
  }
  return generateResponse(
    params.api,
    [
      buildAssistantSystemPrompt(),
      searchPromptBlock,
      'Answer the latest user request using the search result above. Keep the answer objective and cite URLs when useful.',
    ].join('\n\n'),
    toAssistantPromptMessages(withLatestUserMessage(params.messages, params.userMessage)),
    undefined,
    {
      responseFormat: 'text',
      signal: params.signal,
      aiUsage: {
        type: 'assistant_chat',
        label: '助手Agent搜索回答',
        scope: 'chat',
        resourceId: params.chatId,
      },
    },
  );
}

function createAssistantMediaAttachments(patchSet: AssistantAgentPatchSet, timestamp: number): MessageAttachment[] {
  return (patchSet.mediaTasks || []).map((task, index) => ({
    id: `assistant-image-${timestamp}-${index + 1}`,
    kind: 'image',
    status: 'queued',
    slotId: task.slotId || `image-${index + 1}`,
    promptText: task.prompt,
    altText: task.altText || 'AI 图片',
    caption: task.userCaption || task.altText,
    aspectRatio: task.aspectRatio,
    imageSize: task.imageSize,
    referenceImages: task.referenceImages,
    createdAt: timestamp + index,
    updatedAt: timestamp + index,
  }));
}

async function processAssistantMediaAttachments(params: {
  message: Message;
  aiProfiles: AIModelProfile[];
  upsertMessage: (message: Message) => void;
}) {
  if (!params.message.metadata?.attachments?.some((attachment) => attachment.status === 'queued')) return;
  const { processRichMessageMedia } = await import('./richMessageMedia');
  try {
    await processRichMessageMedia({
      message: params.message,
      character: null,
      characters: [],
      aiProfiles: params.aiProfiles,
      upsertMessage: params.upsertMessage,
    });
  } catch (error) {
    params.upsertMessage(markAssistantMediaAttachmentsFailed(params.message, error));
  }
}

async function persistAssistantArtifactsFromReply(params: {
  chat: GroupChat;
  chatId: string;
  userMessage: Message;
  messages: Message[];
  selectedArtifactId?: string | null;
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
    { useLocalWorkspaceStore },
  ] = await Promise.all([
    import('./assistantAgentOrchestrator'),
    import('../stores/useAssistantArtifactStore'),
    import('../stores/useLocalWorkspaceStore'),
  ]);
  await ensureAssistantArtifactStoreHydrated();
  const existingArtifacts = useAssistantArtifactStore.getState().getArtifactsForChat(params.chatId);
  const localWorkspaceState = useLocalWorkspaceStore.getState();
  const defaultLocalWorkspaceDirectory = localWorkspaceState.getDefaultDirectory();
  const selectedLocalWorkspaceFilePaths = localWorkspaceState.getSelectedFilePaths(params.chatId);
  const localWorkspaceFileRegistry = defaultLocalWorkspaceDirectory
    ? await localWorkspaceState.listDefaultDirectoryFiles().catch(() => [])
    : [];
  const plan = await planAssistantAgentChange({
    api: params.api,
    chatId: params.chatId,
    messages: params.messages,
    userMessage: params.userMessage,
    existingArtifacts,
    toolCapabilities: {
      webSearch: isAssistantAgentSearchEnabled(params.chat),
      localWorkspace: Boolean(defaultLocalWorkspaceDirectory),
      localWorkspaceDirectories: localWorkspaceState.directories.map((directory) => ({
        id: directory.id,
        name: directory.name,
        isDefault: directory.id === defaultLocalWorkspaceDirectory?.id,
      })),
    },
    localWorkspaceFileRegistry,
    interactionFocus: {
      ...(params.selectedArtifactId ? { selectedArtifactId: params.selectedArtifactId } : {}),
      ...(selectedLocalWorkspaceFilePaths.length ? {
        selectedLocalWorkspaceFiles: selectedLocalWorkspaceFilePaths.map((path) => ({
          directoryId: defaultLocalWorkspaceDirectory?.id || '',
          path,
        })),
      } : {}),
    },
    signal: params.signal,
  });
  const selectedLocalFilePaths = (selectedLocalWorkspaceFilePaths.length
    ? selectedLocalWorkspaceFilePaths.map((path) => ({ directoryId: defaultLocalWorkspaceDirectory?.id || '', path }))
    : (plan.localFilePaths || []))
    .filter((file) => file.directoryId === defaultLocalWorkspaceDirectory?.id)
    .map((file) => file.path);
  const localFiles = selectedLocalFilePaths.length
    ? await localWorkspaceState.readDefaultDirectoryTextFiles(selectedLocalFilePaths).catch(() => [])
    : [];
  if (selectedLocalFilePaths.length && !localFiles.length) {
    const assistantMessage = await persistAssistantFinalMessage({
      chat: params.chat,
      chatId: params.chatId,
      currentMessages: params.messages,
      content: '我找到了你要处理的本地文件引用，但这些文件当前不可读、不是文本类型，或超过了安全读取限制。请换成文本文件，或缩小文件范围后再试。',
      timestamp: params.timestamp,
      upsertMessage: params.upsertMessage,
    });
    await params.updateChat(params.chatId, {
      lastMessageAt: assistantMessage.timestamp,
      latestMessage: assistantMessage,
    });
    return { message: assistantMessage, patchesCommitted: 0 };
  }
  if (plan.intent === 'search') {
    const query = plan.searchQuery?.trim() || params.userMessage.content.trim();
    const answer = await generateAssistantSearchAnswer({
      api: params.api,
      chatId: params.chatId,
      userMessage: params.userMessage,
      messages: params.messages,
      searchQuery: query,
      signal: params.signal,
    });
    const content = answer.trim() || '搜索已完成，但没有生成有效回答。';
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
    return { message: assistantMessage, patchesCommitted: 0 };
  }
  if (plan.intent === 'chat' && (plan.assistantMessage?.trim() || localFiles.length)) {
    const content = localFiles.length
      ? (await generateAssistantLocalFileAnswer({
        api: params.api,
        chatId: params.chatId,
        userMessage: params.userMessage,
        messages: params.messages,
        localFiles,
        signal: params.signal,
      })).trim() || (plan.assistantMessage || '').trim()
      : (plan.assistantMessage || '').trim();
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
      localFiles,
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

export function buildAgentArtifactReplyContent(patchSet: AssistantAgentPatchSet) {
  const intro = patchSet.assistantMessage.trim() || '已完成产物变更。';
  const visiblePatches = patchSet.patches.filter((patch) => patch.content || patch.files?.length).slice(0, 3);
  const hasImageTasks = Boolean(patchSet.mediaTasks?.length);
  const imageTaskNotice = hasImageTasks ? '正在生成图片，完成后会自动显示。' : '';
  if (!visiblePatches.length && hasImageTasks) return intro || imageTaskNotice;
  if (!visiblePatches.length) return intro;
  return `${intro}${visiblePatches.map(formatPatchForBubble).join('')}${imageTaskNotice ? `\n\n${imageTaskNotice}` : ''}`;
}

export function markAssistantMediaAttachmentsFailed(message: Message, error: unknown): Message {
  const attachments = message.metadata?.attachments || [];
  if (!attachments.some((attachment) => attachment.status === 'queued' || attachment.status === 'generating')) return message;
  const errorText = error instanceof Error ? error.message : String(error || '图片生成失败');
  const nextAttachments = attachments.map((attachment) => (
    attachment.status === 'queued' || attachment.status === 'generating'
      ? { ...attachment, status: 'failed' as const, error: errorText, updatedAt: Date.now() }
      : attachment
  ));
  const generationStatus = nextAttachments.some((attachment) => attachment.status === 'queued' || attachment.status === 'generating')
    ? 'generating'
    : nextAttachments.some((attachment) => attachment.status === 'failed')
      ? 'failed'
      : 'ready';
  return {
    ...message,
    metadata: {
      ...(message.metadata || {}),
      attachments: nextAttachments,
      generation: {
        ...(message.metadata?.generation || {}),
        status: generationStatus,
        updatedAt: Date.now(),
      },
    },
  };
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

function withLatestUserMessage(messages: Message[], userMessage: Message) {
  if (messages.some((message) => message.id === userMessage.id)) return messages;
  return [...messages, userMessage];
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
  selectedArtifactId?: string | null;
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
  if (params.chat.modeState.assistantCapabilities?.agent) {
    const userMessage = latestUserMessage(params.currentMessages);
    if (userMessage) {
      try {
        const { tryRunAssistantAppCommand } = await import('../features/assistantAppTools/assistantAppToolBridge');
        const appCommandResult = await tryRunAssistantAppCommand({
          chatId: params.chatId,
          input: userMessage.content,
          apiConfig: resolvedApi,
          aiProfiles: params.aiProfiles,
        });
        if (appCommandResult) {
          const persisted = await persistAssistantFinalMessage({
            chat: params.chat,
            chatId: params.chatId,
            currentMessages: params.currentMessages,
            content: appCommandResult.content,
            metadata: {
              assistant: {
                mode: 'general',
              },
            },
            timestamp: params.timestamp,
            upsertMessage: params.upsertMessage,
          });
          await params.updateChat(params.chatId, {
            lastMessageAt: persisted.timestamp,
            latestMessage: persisted,
          });
          return persisted;
        }
      } catch (error) {
        console.warn('[assistant-app-command:skip]', error);
      }
    }
  }
  if (isAssistantAgentArtifactEnabled(params.chat)) {
    const userMessage = latestUserMessage(params.currentMessages);
    if (userMessage) {
      const agentResult = await persistAssistantArtifactsFromReply({
        chat: params.chat,
        chatId: params.chatId,
        userMessage,
        messages: params.currentMessages,
        selectedArtifactId: params.selectedArtifactId,
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
