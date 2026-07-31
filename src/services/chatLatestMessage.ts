import type { Message } from '../types/message';

export function isChatPreviewMessage(message: Message | null | undefined): message is Message {
  return Boolean(message && !message.isDeleted && message.type !== 'system' && message.type !== 'event');
}

export function sanitizeChatLatestMessage(message: Message | null | undefined): Message | null {
  return isChatPreviewMessage(message) ? message : null;
}

export function getLatestChatPreviewMessage(messages: Array<Message | null | undefined>): Message | null {
  return messages
    .filter(isChatPreviewMessage)
    .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}
