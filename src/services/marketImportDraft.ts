import { DEFAULT_CHARACTER_MEMORY, type AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { MarketItem } from './marketApi';

export interface MarketImportDraftState {
  marketImportDraft?: {
    item: MarketItem;
  } | null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function remapIds(value: unknown, idMap: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapIds(item, idMap));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? idMap.get(value) || value : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, remapIds(item, idMap)]));
}

export function getMarketImportDraftState(value: unknown): MarketImportDraftState['marketImportDraft'] {
  const state = asRecord(value);
  const draft = asRecord(state.marketImportDraft);
  const item = asRecord(draft.item);
  if (!item.id || !item.kind) return null;
  return { item: item as unknown as MarketItem };
}

export function buildImportedCharacterDraft(item: MarketItem): Partial<AICharacter> {
  const character = asRecord(item.payload?.character);
  return {
    ...(character as Partial<AICharacter>),
    relationships: [],
    memory: DEFAULT_CHARACTER_MEMORY,
    layeredMemories: [],
    runtimeTimeline: [],
    sourceMarketItemId: item.id,
    sourceMarketItemVersion: item.payloadVersion,
    sourceMarketKind: item.kind,
  };
}

export function buildImportedChatDraft(item: MarketItem): Partial<GroupChat> {
  return {
    ...(asRecord(item.payload?.chat) as Partial<GroupChat>),
    sourceMarketItemId: item.id,
    sourceMarketItemVersion: item.payloadVersion,
    sourceMarketKind: item.kind,
  };
}

export function getBundledCharacterEntries(item: MarketItem) {
  const entries = Array.isArray(item.payload?.characters) ? item.payload.characters.map(asRecord) : [];
  return entries.map((entry) => ({
    localId: typeof entry.localId === 'string' ? entry.localId : '',
    template: asRecord(entry.template) as Partial<AICharacter>,
  })).filter((entry) => entry.localId);
}

export function buildBundledCharacterPreview(item: MarketItem): AICharacter[] {
  return getBundledCharacterEntries(item).map((entry) => ({
    id: entry.localId,
    name: entry.template.name || '未命名角色',
    avatar: entry.template.avatar || '🤖',
    personality: entry.template.personality || {},
    behavior: entry.template.behavior || {},
    expertise: entry.template.expertise || [],
    speakingStyle: entry.template.speakingStyle || '',
    background: entry.template.background || '',
    relationships: entry.template.relationships || [],
    memory: entry.template.memory || DEFAULT_CHARACTER_MEMORY,
    layeredMemories: entry.template.layeredMemories || [],
    runtimeTimeline: entry.template.runtimeTimeline || [],
    isPreset: false,
    createdAt: 0,
    updatedAt: 0,
    sourceMarketItemId: item.id,
    sourceMarketItemVersion: item.payloadVersion,
    sourceMarketKind: item.kind,
  } as AICharacter));
}
