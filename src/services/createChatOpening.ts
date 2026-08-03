import type { Message } from '../types/message';
import { TOPIC_GUIDANCE_SENDER_NAME } from './chatMessageSemantics';

export function buildOpeningTopicGuideMessage(chatId: string, topicText: string): Omit<Message, 'id' | 'timestamp' | 'isDeleted'> {
  return {
    chatId,
    type: 'god',
    senderId: 'user',
    senderName: TOPIC_GUIDANCE_SENDER_NAME,
    content: topicText,
    emotion: 0,
  };
}
