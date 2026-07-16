import { readPersistentUiValue, writePersistentUiValue } from '../utils/persistentUiState';

const ASSISTANT_AGENT_DEFAULT_KEY = 'assistant-agent-default-enabled';

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function readAssistantAgentDefaultEnabled() {
  return readPersistentUiValue(ASSISTANT_AGENT_DEFAULT_KEY, false, isBoolean);
}

export function writeAssistantAgentDefaultEnabled(enabled: boolean) {
  writePersistentUiValue(ASSISTANT_AGENT_DEFAULT_KEY, enabled);
}
