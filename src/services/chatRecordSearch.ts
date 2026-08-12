import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';

export interface ChatRecordSearchMatch {
  chatId: string;
  chatName: string;
  chatType: GroupChat['type'];
  chatMode?: GroupChat['mode'];
  scenarioId?: string;
  messageId?: string;
  timestamp?: number;
  senderName?: string;
  snippet: string;
  matchedKeywords: string[];
  score: number;
  source: 'local' | 'cloud';
}

export interface ChatRecordSearchResult {
  query: string;
  speakerQuery?: string;
  source: 'local' | 'cloud';
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  limit: number;
  offset: number;
  sortBy: 'relevance' | 'time_desc' | 'time_asc';
  matches: ChatRecordSearchMatch[];
}

export interface ChatRecordSearchSpeakerCandidate {
  id: string;
  name: string;
  aliases?: string[];
}

const WEEKDAY_ALIASES: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function clean(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function normalizeActorAlias(value: string) {
  return normalizeText(value);
}

function buildSpeakerAliases(params: {
  speakerQuery?: string;
  speakerCandidates?: ChatRecordSearchSpeakerCandidate[];
}) {
  const aliases = new Set<string>();
  const query = clean(params.speakerQuery);
  if (query) {
    aliases.add(normalizeActorAlias(query));
    query.split(/[\s,，.。;；:：!?！？、"'“”‘’()[\]{}<>《》和与及跟同里中的]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
      .forEach((part) => aliases.add(normalizeActorAlias(part)));
  }
  params.speakerCandidates?.forEach((candidate) => {
    const name = normalizeActorAlias(candidate.name || '');
    if (!name) return;
    aliases.add(name);
    candidate.aliases?.forEach((alias) => {
      const normalized = normalizeActorAlias(alias || '');
      if (normalized) aliases.add(normalized);
    });
  });
  return Array.from(aliases).filter(Boolean);
}

export function tokenizeChatRecordQuery(query: string) {
  const ignored = new Set(['我', '聊到', '聊过', '聊天', '记录', '里面', '里的', '大纲', '帮我', '搜索', '查找', '找一下', '列出', '找到', '云端', '本地']);
  const normalized = query.toLowerCase();
  const tokens = new Set<string>();
  normalized
    .split(/[\s,，.。;；:：!?！？、"'“”‘’()[\]{}<>《》和与及跟同里中的]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !ignored.has(part))
    .forEach((part) => tokens.add(part));
  const cjkSegments = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  cjkSegments.forEach((segment) => {
    if (ignored.has(segment)) return;
    for (let size = Math.min(4, segment.length); size >= 2; size -= 1) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        const token = segment.slice(index, index + size);
        if (!ignored.has(token)) tokens.add(token);
      }
    }
  });
  return Array.from(tokens).slice(0, 24);
}

export function inferChatRecordDateRange(query: string, now = new Date()): { from?: number; to?: number } | null {
  const weekday = query.match(/上周([日天一二三四五六])/);
  if (weekday) {
    const targetDay = WEEKDAY_ALIASES[weekday[1]];
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    const currentDay = base.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const lastMonday = new Date(base);
    lastMonday.setDate(base.getDate() + mondayOffset - 7);
    const target = new Date(lastMonday);
    target.setDate(lastMonday.getDate() + (targetDay === 0 ? 6 : targetDay - 1));
    return { from: target.getTime(), to: target.getTime() + 24 * 60 * 60 * 1000 - 1 };
  }
  if (/昨天/.test(query)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 1);
    return { from: start.getTime(), to: start.getTime() + 24 * 60 * 60 * 1000 - 1 };
  }
  if (/今天/.test(query)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: start.getTime() + 24 * 60 * 60 * 1000 - 1 };
  }
  return null;
}

function snippetAround(text: string, keywords: string[]) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const lower = compact.toLowerCase();
  const firstHit = keywords
    .map((keyword) => lower.indexOf(keyword.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstHit - 42);
  const end = Math.min(compact.length, firstHit + 120);
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`;
}

function storyMetadataText(metadata: unknown) {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const narrativeTurn = record.narrativeTurn && typeof record.narrativeTurn === 'object' && !Array.isArray(record.narrativeTurn)
    ? record.narrativeTurn as Record<string, unknown>
    : {};
  const narrativeBlocks = Array.isArray(narrativeTurn.blocks) ? narrativeTurn.blocks : [];
  const blockText = narrativeBlocks.map((block) => {
    const item = block && typeof block === 'object' && !Array.isArray(block) ? block as Record<string, unknown> : {};
    return [item.actorName, item.text].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join('：');
  });
  const storyEvents = Array.isArray(record.storyEvents) ? record.storyEvents : [];
  const eventText = storyEvents.flatMap((event) => {
    const item = event && typeof event === 'object' && !Array.isArray(event) ? event as Record<string, unknown> : {};
    return [item.title, item.speakerName, item.text, item.summary].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  });
  return [...blockText, ...eventText].join('\n');
}

function storyMetadataSpeakerText(metadata: unknown) {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const narrativeTurn = record.narrativeTurn && typeof record.narrativeTurn === 'object' && !Array.isArray(record.narrativeTurn)
    ? record.narrativeTurn as Record<string, unknown>
    : {};
  const narrativeBlocks = Array.isArray(narrativeTurn.blocks) ? narrativeTurn.blocks : [];
  const blockSpeakers = narrativeBlocks.map((block) => {
    const item = block && typeof block === 'object' && !Array.isArray(block) ? block as Record<string, unknown> : {};
    return [item.actorName, item.characterId].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join(' ');
  });
  const storyEvents = Array.isArray(record.storyEvents) ? record.storyEvents : [];
  const eventSpeakers = storyEvents.map((event) => {
    const item = event && typeof event === 'object' && !Array.isArray(event) ? event as Record<string, unknown> : {};
    return [item.speakerName, item.characterId].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join(' ');
  });
  return [...blockSpeakers, ...eventSpeakers].join('\n');
}

function messageSearchText(message: Pick<Message, 'content' | 'metadata'>) {
  return [message.content, storyMetadataText(message.metadata)].filter(Boolean).join('\n');
}

function messageSpeakerText(message: Pick<Message, 'senderName' | 'metadata'>) {
  return [message.senderName, storyMetadataSpeakerText(message.metadata)].filter(Boolean).join('\n');
}

function scoreText(text: string, query: string, keywords: string[]) {
  const source = normalizeText(text);
  const target = normalizeText(query);
  let score = 0;
  if (target && source.includes(target)) score += 80 + Math.min(target.length, 40);
  keywords.forEach((keyword) => {
    if (!keyword) return;
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) return;
    if (source.includes(normalizedKeyword)) score += Math.min(28, 6 + normalizedKeyword.length * 2);
  });
  return score;
}

export function searchLocalChatRecords(params: {
  chats: GroupChat[];
  messagesByChatId: Record<string, Pick<Message, 'id' | 'content' | 'metadata' | 'senderName' | 'timestamp' | 'isDeleted'>[]>;
  query: string;
  speakerQuery?: string;
  speakerCandidates?: ChatRecordSearchSpeakerCandidate[];
  chatTypePreference?: 'group' | 'direct' | 'assistant' | 'any';
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'time_desc' | 'time_asc';
  now?: Date;
}): ChatRecordSearchResult {
  const query = clean(params.query);
  const limit = Math.min(Math.max(Math.floor(params.limit || 20), 1), 100);
  const offset = Math.max(Math.floor(params.offset || 0), 0);
  const sortBy = params.sortBy || 'relevance';
  const keywords = tokenizeChatRecordQuery(query);
  const speakerAliases = buildSpeakerAliases({
    speakerQuery: params.speakerQuery,
    speakerCandidates: params.speakerCandidates,
  });
  const dateRange = inferChatRecordDateRange(query, params.now);
  const matches: ChatRecordSearchMatch[] = [];
  params.chats.forEach((chat) => {
    if (chat.deletedAt) return;
    if (params.chatTypePreference && params.chatTypePreference !== 'any' && chat.type !== params.chatTypePreference) return;
    const messages = (params.messagesByChatId[chat.id] || [])
      .filter((message) => !message.isDeleted)
      .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
    const chatScore = scoreText(`${chat.name}\n${chat.topic || ''}\n${chat.worldState?.recentEvent || ''}`, query, keywords);
    messages.forEach((message, index) => {
      if (dateRange && message.timestamp && (message.timestamp < dateRange.from! || message.timestamp > dateRange.to!)) return;
      if (speakerAliases.length) {
        const speakerText = normalizeActorAlias(messageSpeakerText(message));
        if (!speakerAliases.some((alias) => speakerText.includes(alias))) return;
      }
      const searchableMessageText = messageSearchText(message);
      const sameMessageScore = scoreText(searchableMessageText, query, keywords);
      const contextMessages = messages.slice(Math.max(0, index - 2), Math.min(messages.length, index + 3));
      const contextText = contextMessages.map((item) => messageSearchText(item)).join('\n');
      const contextScore = scoreText(contextText, query, keywords);
      const speakerScore = speakerAliases.length ? scoreText(messageSpeakerText(message), params.speakerQuery || query, speakerAliases) : 0;
      const adjustedScore = sameMessageScore * 2 + Math.max(0, contextScore - sameMessageScore) + chatScore * 0.35 + speakerScore * 3;
      if (adjustedScore <= 0) return;
      const matchedKeywords = keywords.filter((keyword) => normalizeText(contextText).includes(normalizeText(keyword))).slice(0, 8);
      matches.push({
        chatId: chat.id,
        chatName: chat.name,
        chatType: chat.type,
        chatMode: chat.mode,
        scenarioId: chat.sessionKind?.scenarioId,
        messageId: message.id,
        timestamp: message.timestamp,
        senderName: message.senderName,
        snippet: snippetAround(contextText, matchedKeywords.length ? matchedKeywords : keywords) || snippetAround(searchableMessageText, keywords),
        matchedKeywords,
        score: adjustedScore,
        source: 'local',
      });
    });
    if (!messages.length && chatScore > 0) {
      if (speakerAliases.length) return;
      matches.push({
        chatId: chat.id,
        chatName: chat.name,
        chatType: chat.type,
        chatMode: chat.mode,
        scenarioId: chat.sessionKind?.scenarioId,
        snippet: snippetAround(`${chat.name} ${chat.topic || ''}`, keywords),
        matchedKeywords: keywords.filter((keyword) => normalizeText(`${chat.name} ${chat.topic || ''}`).includes(normalizeText(keyword))).slice(0, 8),
        score: chatScore,
        source: 'local',
      });
    }
  });
  const sortedMatches = matches.sort((left, right) => {
    if (sortBy === 'time_desc') return (right.timestamp || 0) - (left.timestamp || 0) || right.score - left.score;
    if (sortBy === 'time_asc') return (left.timestamp || 0) - (right.timestamp || 0) || right.score - left.score;
    return right.score - left.score || (right.timestamp || 0) - (left.timestamp || 0);
  });
  const deduped = new Map<string, ChatRecordSearchMatch>();
  sortedMatches.forEach((match) => {
      const key = `${match.chatId}:${match.messageId || 'chat'}`;
      if (!deduped.has(key)) deduped.set(key, match);
    });
  const allMatches = Array.from(deduped.values());
  return {
    query,
    speakerQuery: params.speakerQuery ? clean(params.speakerQuery) : undefined,
    source: 'local',
    totalCount: allMatches.length,
    returnedCount: Math.min(Math.max(allMatches.length - offset, 0), limit),
    hasMore: allMatches.length > offset + limit,
    limit,
    offset,
    sortBy,
    matches: allMatches.slice(offset, offset + limit),
  };
}
