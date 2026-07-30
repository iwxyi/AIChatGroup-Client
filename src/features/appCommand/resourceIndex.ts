import type { GroupChat } from '../../types/chat';
import type { AICharacter } from '../../types/character';
import { normalizeCharacterGroup } from '../../types/character';
import type { Message } from '../../types/message';
import type { LocalActionPlan } from './commandTypes';

export function cleanResourceText(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeResourceKey(value?: string | null) {
  return cleanResourceText(value).replace(/\s+/g, '').toLowerCase();
}

function tokenizeResourceQuery(query: string) {
  const normalized = query.toLowerCase();
  const tokens = new Set(
    normalized
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  );
  const cjkSegments = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  cjkSegments.forEach((segment) => {
    for (let size = Math.min(4, segment.length); size >= 2; size -= 1) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        tokens.add(segment.slice(index, index + size));
      }
    }
  });
  return Array.from(tokens);
}

export function scoreResourceText(text: string, query: string) {
  const source = text.toLowerCase();
  const target = query.toLowerCase();
  if (!target) return 0;
  if (source.includes(target)) return 20 + target.length;
  return tokenizeResourceQuery(target).filter((part) => source.includes(part)).length;
}

export function characterSearchText(character: AICharacter) {
  return [
    character.name,
    character.group,
    character.background,
    character.speakingStyle,
    character.expertise?.join(' '),
    character.voiceConfig?.role,
    character.visualIdentity?.description,
    character.visualIdentity?.styleHint,
    character.coreProfile?.coreDesire,
    character.coreProfile?.coreFear,
    character.coreProfile?.values?.join(' '),
    character.coreProfile?.valuePriority?.join(' '),
    character.coreProfile?.socialMask,
    character.coreProfile?.biases?.join(' '),
    character.coreProfile?.sensitivities?.join(' '),
    character.coreProfile?.interactionHabits?.join(' '),
  ].filter(Boolean).join('\n');
}

export function rankCharacterResources(params: {
  characters: AICharacter[];
  queries: string[];
  sourceGroup?: string | null;
}) {
  const sourceGroup = normalizeCharacterGroup(params.sourceGroup);
  if (sourceGroup && !params.queries.length) {
    return params.characters.filter((character) => normalizeCharacterGroup(character.group) === sourceGroup);
  }

  const matches = new Map<string, { character: AICharacter; score: number; fullMatch: boolean }>();
  for (const query of params.queries) {
    const normalizedQuery = normalizeResourceKey(query);
    params.characters.forEach((character) => {
      if (sourceGroup && normalizeCharacterGroup(character.group) !== sourceGroup) return;
      const searchable = characterSearchText(character);
      const score = scoreResourceText(searchable, query) + (normalizeResourceKey(character.name) === normalizedQuery ? 40 : 0);
      if (score <= 0) return;
      const existing = matches.get(character.id);
      const fullMatch = Boolean(normalizedQuery && normalizeResourceKey(character.name) === normalizedQuery);
      if (!existing || score > existing.score) matches.set(character.id, { character, score, fullMatch });
    });
  }
  return Array.from(matches.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.character);
}

export function rankChatResources(params: {
  chats: GroupChat[];
  query: string;
  messagesByChatId?: Record<string, Pick<Message, 'content' | 'isDeleted'>[]>;
  includeMessages?: boolean;
  chatTypePreference?: LocalActionPlan['chatTypePreference'];
}) {
  const normalizedQuery = normalizeResourceKey(params.query);
  return params.chats
    .map((chat) => {
      const messages = params.includeMessages ? params.messagesByChatId?.[chat.id] || [] : [];
      const messageText = messages
        .filter((message) => !message.isDeleted)
        .slice(-30)
        .map((message) => message.content)
        .join('\n');
      const searchableText = `${chat.name}\n${chat.topic}\n${chat.worldState?.recentEvent || ''}\n${messageText}`;
      const score = scoreResourceText(searchableText, params.query)
        + (normalizeResourceKey(chat.name) === normalizedQuery ? 40 : 0)
        + (params.chatTypePreference && params.chatTypePreference !== 'any' && chat.type === params.chatTypePreference ? 10 : 0);
      return {
        chat,
        score,
        fullMatch: Boolean(normalizedQuery && normalizeResourceKey(searchableText).includes(normalizedQuery)),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}
