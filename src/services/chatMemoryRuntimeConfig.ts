import { DEFAULT_CHAT_MEMORY_SETTINGS, normalizeChatMemorySettings, type ChatMemorySettings } from '../types/settings';

let currentChatMemoryConfig: ChatMemorySettings = DEFAULT_CHAT_MEMORY_SETTINGS;

export function setChatMemoryRuntimeConfig(config: Partial<ChatMemorySettings> | null | undefined) {
  currentChatMemoryConfig = normalizeChatMemorySettings(config);
}

export function getChatMemoryRuntimeConfig(): ChatMemorySettings {
  return currentChatMemoryConfig;
}
