import type { GroupChat } from '../../types/chat';
import type { AICharacter } from '../../types/character';
import type { Message } from '../../types/message';
import { sanitizeUserFacingText } from '../../services/displayTextSanitizer';
import { isUserFacingMemoryItem } from '../../services/memoryPresentation';

function cleanRelationshipPreview(text: string) {
  return text
    .replace(/^[^\s]+→/, '')
    .replace(/^[^↔]+↔[^：:]+[：:]/, '')
    .trim();
}

function buildRelationshipPreview(members: AICharacter[]) {
  return members
    .flatMap((member) => member.relationships
      .filter((relation) => Boolean(relation.note?.trim()))
      .slice(0, 1)
      .map((relation) => {
        const preview = cleanRelationshipPreview(relation.note || '');
        return preview ? `${member.name}：${preview}` : '';
      }))
    .find(Boolean) || '';
}

function clipPreview(text: string, max = 72) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isRuntimeAxisSnapshot(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return trimmed
    .split(/[；;]/)
    .every((part) => /^[^：:]{1,40}[：:]-?\d+(?:\.\d+)?$/.test(part.trim()));
}

function buildMemorySummaryPreview(chat: GroupChat, members: AICharacter[]) {
  return sanitizeUserFacingText(
    (chat.layeredMemories || [])
      .filter(isUserFacingMemoryItem)
      .filter((item) => !isRuntimeAxisSnapshot(item.text))
      .slice(-2)
      .map((item) => item.text)
      .join(' / '),
    members,
  );
}

export function stripMarkdownForPreview(text: string) {
  return text
    .replace(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    .replace(/^\s{0,3}\|/gm, '')
    .replace(/\|\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^[\s:-]{3,}$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLatestMessagePreview(message: Message | null, members: AICharacter[]) {
  if (!message || message.isDeleted || message.type === 'system' || message.type === 'event') return '';
  const content = stripMarkdownForPreview(message.content);
  const senderName = message.type === 'user'
    ? '你'
    : message.type === 'god'
      ? 'God Mode'
      : members.find((member) => member.id === message.senderId)?.name || message.senderName || '未知';
  return clipPreview(sanitizeUserFacingText(`${senderName}：${content}`, members));
}

export function buildChatSubtitle(
  chat: GroupChat,
  members: AICharacter[],
  latestMessage: Message | null,
  companionshipPreview = '',
) {
  const latestMessagePreview = buildLatestMessagePreview(latestMessage, members);
  if (!latestMessagePreview && chat.type === 'direct' && companionshipPreview) {
    return clipPreview(sanitizeUserFacingText(companionshipPreview, members));
  }
  const relationshipPreview = buildRelationshipPreview(members);
  const memorySummary = buildMemorySummaryPreview(chat, members);
  const recentEvent = sanitizeUserFacingText(chat.worldState?.recentEvent || '', members);
  return latestMessagePreview || clipPreview(sanitizeUserFacingText(relationshipPreview || memorySummary || recentEvent || chat.topic || '', members));
}
