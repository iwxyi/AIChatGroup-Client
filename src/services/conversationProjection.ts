import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import { getChannelSemantics } from './channelSemanticsRegistry';

export type ProjectedChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<{
    url: string;
    mimeType?: string;
  }>;
};

export interface ConversationProjectionOptions {
  currentSpeakerId?: string;
  chatType?: GroupChat['type'];
  imageAttachmentMode?: 'none' | 'latest-user' | 'all';
}

export interface ConversationProjectionInput {
  messages: Message[];
  characters: Map<string, AICharacter>;
  limit?: number;
  options?: ConversationProjectionOptions;
}

function getTranscriptSpeakerName(message: Message, characters: Map<string, AICharacter>) {
  if (message.type === 'user' || message.type === 'god') return message.senderName || 'User';
  if (message.type === 'system') return 'System';
  if (message.type === 'event') return 'Event';
  return message.senderName || characters.get(message.senderId)?.name || 'Unknown';
}

function stripEmbeddedTranscriptJson(content: string) {
  const normalized = content || '';
  const roleMarker = normalized.search(/["“]?role["”]?\s*:\s*["“](assistant|user|system)["”]/i);
  if (roleMarker >= 0) return normalized.slice(0, roleMarker).trim();
  return normalized;
}

function compactTranscriptContent(content: string, max = 1400) {
  const trimmed = stripEmbeddedTranscriptJson(content).trim();
  if (Array.from(trimmed).length <= max) return trimmed;
  return `${Array.from(trimmed).slice(0, max).join('')}...`;
}

function buildTranscriptHeader(message: Message, characters: Map<string, AICharacter>, currentSpeakerId?: string) {
  if (message.type === 'user' || message.type === 'god') return '用户';
  if (message.senderId === currentSpeakerId) return '自己';
  return getTranscriptSpeakerName(message, characters);
}

function buildImageAttachmentText(message: Message) {
  const attachments = (message.metadata?.attachments || [])
    .filter((attachment) => attachment.kind === 'image' && attachment.status !== 'deleted' && attachment.status !== 'failed');
  if (!attachments.length) return '';
  const labels = attachments
    .slice(0, 4)
    .map((attachment, index) => attachment.caption || attachment.altText || `图片 ${index + 1}`);
  const suffix = attachments.length > labels.length ? ` 等 ${attachments.length} 张图片` : '';
  return `[图片附件：${labels.join('、')}${suffix}]`;
}

function buildTranscriptLine(message: Message, characters: Map<string, AICharacter>, currentSpeakerId?: string) {
  return `${buildTranscriptHeader(message, characters, currentSpeakerId)}: ${[compactTranscriptContent(message.content), buildImageAttachmentText(message)].filter(Boolean).join('\n')}`;
}

function buildTranscriptInstruction(chatType: GroupChat['type']) {
  const semantics = getChannelSemantics({ type: chatType });
  return [
    'Conversation transcript for context only:',
    'The complete recent transcript is provided separately as chat messages and is not repeated here.',
    semantics.transcriptInstruction,
  ].join('\n');
}

function buildAssistantHistoryPrompt(history: string) {
  return history;
}

function isVisibleMessage(message: Message) {
  if (message.isDeleted) return false;
  if (message.type === 'system' || message.type === 'event') return false;
  return true;
}

function buildProjectedImageAttachments(message: Message) {
  const attachments = (message.metadata?.attachments || [])
    .filter((attachment) => attachment.kind === 'image' && attachment.url && attachment.status !== 'deleted' && attachment.status !== 'failed')
    .map((attachment) => ({ url: attachment.url as string, mimeType: attachment.mimeType }))
    .slice(0, 8);
  return attachments.length ? attachments : undefined;
}

function shouldProjectImageAttachments(message: Message, visible: Message[], mode: ConversationProjectionOptions['imageAttachmentMode']) {
  if (mode === 'all') return true;
  if (mode !== 'latest-user') return false;
  const latestUserImageMessage = [...visible]
    .reverse()
    .find((item) => (
      (item.type === 'user' || item.type === 'god')
      && item.metadata?.attachments?.some((attachment) => attachment.kind === 'image' && attachment.url && attachment.status !== 'deleted' && attachment.status !== 'failed')
    ));
  return Boolean(latestUserImageMessage && latestUserImageMessage.id === message.id);
}

export function projectConversationForModel(input: ConversationProjectionInput): ProjectedChatMessage[] {
  const visible = input.messages
    .filter(isVisibleMessage)
    .slice(-(input.limit ?? 12));
  const options = input.options || {};
  const currentSpeakerId = options.currentSpeakerId;
  const roomTranscript = visible.filter((message) => !(message.type === 'ai' && currentSpeakerId && message.senderId === currentSpeakerId));
  const projected: ProjectedChatMessage[] = [];
  if (roomTranscript.length) {
    projected.push({
      role: 'user',
      content: buildTranscriptInstruction(options.chatType || 'group'),
    });
  }
  for (const message of visible) {
    const attachments = shouldProjectImageAttachments(message, visible, options.imageAttachmentMode)
      ? buildProjectedImageAttachments(message)
      : undefined;
    if (message.type === 'ai' && currentSpeakerId && message.senderId === currentSpeakerId) {
      projected.push({
        role: 'assistant',
        content: buildAssistantHistoryPrompt(compactTranscriptContent(message.content)),
        attachments,
      });
      continue;
    }
    projected.push({
      role: 'user',
      content: buildTranscriptLine(message, input.characters, currentSpeakerId),
      attachments,
    });
  }
  return projected;
}
