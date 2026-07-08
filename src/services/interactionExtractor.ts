import type { Message } from '../types/message';
import type { InteractionEventPayload } from '../types/runtimeEvent';

export function extractInteractionEvent(params: {
  message: Pick<Message, 'content' | 'senderId'>;
  characters: Array<{ id: string; name: string }>;
}): InteractionEventPayload | null {
  void params;
  return null;
}
