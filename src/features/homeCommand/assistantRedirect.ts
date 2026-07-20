import type { NavigateFunction } from 'react-router-dom';
import { buildAssistantChatDraft } from '../../services/chatDraftBuilder';
import { useChatStore } from '../../stores/useChatStore';

export interface HomeCommandAssistantState {
  homeCommandInitialMessage: string;
  homeCommandStartAgent?: boolean;
  homeCommandPreferredMode?: 'chat' | 'image' | 'research' | 'tool';
}

export async function openAssistantFromHomeCommand(
  navigate: NavigateFunction,
  input: string,
  preferredMode: HomeCommandAssistantState['homeCommandPreferredMode'] = 'chat',
) {
  const chat = await useChatStore.getState().addChat(buildAssistantChatDraft());
  navigate(`/chats/${encodeURIComponent(chat.id)}?fromTab=3`, {
    state: {
      homeCommandInitialMessage: input,
      homeCommandStartAgent: true,
      homeCommandPreferredMode: preferredMode,
    } satisfies HomeCommandAssistantState,
  });
  return chat;
}

