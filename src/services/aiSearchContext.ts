import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import { api, ApiError, type AiSearchResultItem } from './api';
import { logDeveloperDiagnostic } from './developerDiagnostics';

const SEARCH_INTENT_PATTERN = /(搜索|搜一下|查一下|查查|联网|网上|最新|新闻|今天|实时|现在|价格|票房|汇率|政策|法规|公告|官网|资料|source|search|web|latest|today|news|current)/i;

function recentUserText(messages: Message[]) {
  return messages
    .filter((message) => !message.isDeleted && message.type === 'user' && message.content.trim())
    .slice(-2)
    .map((message) => message.content.trim())
    .join('\n')
    .slice(-500);
}

function shouldSearch(text: string) {
  if (!text.trim()) return false;
  return SEARCH_INTENT_PATTERN.test(text);
}

function formatResult(item: AiSearchResultItem, index: number) {
  const body = item.summary || item.snippet || '';
  const source = [item.siteName, item.publishedAt].filter(Boolean).join(' / ');
  const images = item.imageUrls?.length ? `Images: ${item.imageUrls.slice(0, 3).join(' | ')}` : '';
  return [
    `${index + 1}. ${item.title}`,
    `URL: ${item.url}`,
    item.siteIcon ? `Site icon: ${item.siteIcon}` : '',
    source ? `Source: ${source}` : '',
    body ? `Excerpt: ${body}` : '',
    images,
  ].filter(Boolean).join('\n');
}

export async function buildAiSearchPromptBlock(input: {
  chat: GroupChat;
  messages: Message[];
  enabled: boolean;
  signal?: AbortSignal;
}) {
  if (!input.enabled) return '';
  const query = recentUserText(input.messages);
  if (!shouldSearch(query)) return '';
  try {
    const membership = await api.getBillingMembership();
    if (!membership.vipEntitlement?.entitlement.aiSearchEnabled) return '';
    if (input.signal?.aborted) return '';
    const response = await api.searchWeb(query, {
      source: 'chat',
      resourceId: input.chat.id,
    });
    if (!response.results.length) return '';
    return [
      '## Web Search Context',
      `Query: ${response.query}`,
      `Provider: ${response.providerCode}; charged ${response.pointCost} AI points.`,
      'Live web search results are available below. Use them when relevant; do not say you cannot browse or cannot access current information. Do not invent citations. Prefer concise synthesis over listing every result.',
      response.results.map(formatResult).join('\n\n'),
    ].join('\n');
  } catch (error) {
    const expectedSkip = error instanceof ApiError && (
      error.code === 'AI_SEARCH_ENTITLEMENT_REQUIRED'
      || error.code === 'AI_SEARCH_PROVIDER_UNAVAILABLE'
      || error.code === 'AI_SEARCH_POINTS_INSUFFICIENT'
      || error.status === 401
    );
    logDeveloperDiagnostic('chat-run:search-context-skipped', {
      chatId: input.chat.id,
      reason: error instanceof Error ? error.message : 'search failed',
      code: error instanceof ApiError ? error.code : undefined,
      expectedSkip,
    }, expectedSkip ? 'debug' : 'info', 'chat-run');
    return '';
  }
}
