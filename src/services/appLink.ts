import { buildSettingsPath, type SettingsCardKey, type SettingsTabKey } from '../routes/settingsRoute';

export const APP_LINK_SCHEME = 'ssmm';

export type AppLinkTarget =
  | 'home'
  | 'character'
  | 'characters'
  | 'chat'
  | 'chats'
  | 'assistant_artifact'
  | 'settings'
  | 'recycle_bin'
  | 'calendar'
  | 'moments'
  | 'letters'
  | 'account'
  | 'membership';

export type AppLinkAction = 'open' | 'view' | 'edit' | 'create';

export interface AppLink {
  scheme: typeof APP_LINK_SCHEME;
  version: 1;
  target: AppLinkTarget;
  id?: string;
  action?: AppLinkAction;
  params?: Record<string, string>;
}

function normalizeTarget(value: string): AppLinkTarget | null {
  const target = value.trim().replace(/_/g, '-').toLowerCase();
  if (target === '' || target === 'home') return 'home';
  if (target === 'character') return 'character';
  if (target === 'characters') return 'characters';
  if (target === 'chat') return 'chat';
  if (target === 'chats') return 'chats';
  if (target === 'artifact' || target === 'assistant-artifact' || target === 'assistant_artifact') return 'assistant_artifact';
  if (target === 'settings') return 'settings';
  if (target === 'recycle-bin' || target === 'recycle_bin') return 'recycle_bin';
  if (target === 'calendar') return 'calendar';
  if (target === 'moments') return 'moments';
  if (target === 'letters') return 'letters';
  if (target === 'account') return 'account';
  if (target === 'membership') return 'membership';
  return null;
}

function normalizeAction(value: string | null): AppLinkAction | undefined {
  if (value === 'open' || value === 'view' || value === 'edit' || value === 'create') return value;
  return undefined;
}

function paramsFromSearch(searchParams: URLSearchParams) {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key === 'action' || key === 'v') return;
    params[key] = value;
  });
  return Object.keys(params).length ? params : undefined;
}

export function serializeAppLink(link: Omit<AppLink, 'scheme' | 'version'> | AppLink) {
  const target = link.target;
  const idPath = link.id ? `/${encodeURIComponent(link.id)}` : '';
  const params = new URLSearchParams();
  if (link.action) params.set('action', link.action);
  Object.entries(link.params || {}).forEach(([key, value]) => {
    if (value !== '') params.set(key, value);
  });
  const query = params.toString();
  return `${APP_LINK_SCHEME}://${target}${idPath}${query ? `?${query}` : ''}`;
}

export function normalizeInternalAppHref(href: string | null | undefined) {
  const link = parseAppLink(href);
  return link ? serializeAppLink(link) : href || '';
}

export function parseAppLink(href: string | null | undefined): AppLink | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase().startsWith(`${APP_LINK_SCHEME}://`)) {
    try {
      const url = new URL(trimmed);
      const target = normalizeTarget(url.hostname);
      if (!target) return null;
      const id = url.pathname.split('/').filter(Boolean)[0];
      return {
        scheme: APP_LINK_SCHEME,
        version: 1,
        target,
        id: id ? decodeURIComponent(id) : undefined,
        action: normalizeAction(url.searchParams.get('action')),
        params: paramsFromSearch(url.searchParams),
      };
    } catch {
      return null;
    }
  }

  return parseLegacyWebAppLink(trimmed);
}

function parseLegacyWebAppLink(href: string): AppLink | null {
  if (!href.startsWith('/')) return null;
  try {
    const url = new URL(href, 'http://sense-murmur.local');
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const [first, second, third] = segments;
    if (!first) return { scheme: APP_LINK_SCHEME, version: 1, target: 'home', action: 'open' };
    if (first === 'characters') {
      if (second === 'create') return { scheme: APP_LINK_SCHEME, version: 1, target: 'characters', action: 'create', params: paramsFromSearch(url.searchParams) };
      if (second === 'batch-generate') return null;
      if (second && third === 'edit') return { scheme: APP_LINK_SCHEME, version: 1, target: 'character', id: second, action: 'edit', params: paramsFromSearch(url.searchParams) };
      return { scheme: APP_LINK_SCHEME, version: 1, target: 'characters', action: 'open', params: paramsFromSearch(url.searchParams) };
    }
    if (first === 'chats') {
      if (second === 'create') return { scheme: APP_LINK_SCHEME, version: 1, target: 'chats', action: 'create', params: paramsFromSearch(url.searchParams) };
      if (second && third === 'edit') return { scheme: APP_LINK_SCHEME, version: 1, target: 'chat', id: second, action: 'edit', params: paramsFromSearch(url.searchParams) };
      if (second) return { scheme: APP_LINK_SCHEME, version: 1, target: 'chat', id: second, action: 'open', params: paramsFromSearch(url.searchParams) };
      return { scheme: APP_LINK_SCHEME, version: 1, target: 'chats', action: 'open', params: paramsFromSearch(url.searchParams) };
    }
    if (first === 'direct' && second === 'create') return { scheme: APP_LINK_SCHEME, version: 1, target: 'chats', action: 'create', params: { ...(paramsFromSearch(url.searchParams) || {}), type: 'direct' } };
    if (first === 'settings' && second === 'recycle-bin') return { scheme: APP_LINK_SCHEME, version: 1, target: 'recycle_bin', action: 'open', params: paramsFromSearch(url.searchParams) };
    if (first === 'settings') return { scheme: APP_LINK_SCHEME, version: 1, target: 'settings', action: 'open', params: paramsFromSearch(url.searchParams) };
    if (first === 'calendar' || first === 'moments' || first === 'letters' || first === 'account' || first === 'membership') {
      return { scheme: APP_LINK_SCHEME, version: 1, target: first, action: 'open', params: paramsFromSearch(url.searchParams) };
    }
    if (first === 'ai-models') return { scheme: APP_LINK_SCHEME, version: 1, target: 'settings', action: 'open', params: { tab: 'models' } };
    return null;
  } catch {
    return null;
  }
}

function queryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function resolveAppLinkToWebPath(link: AppLink): string | null {
  const params = link.params || {};
  if (link.target === 'home') return '/';
  if (link.target === 'characters') {
    if (link.action === 'create') return `/characters/create${queryString(params)}`;
    return `/characters${queryString(params)}`;
  }
  if (link.target === 'character') {
    if (!link.id) return null;
    const action = link.action || 'edit';
    if (action === 'edit' || action === 'view' || action === 'open') return `/characters/${encodeURIComponent(link.id)}/edit${queryString(params)}`;
    return null;
  }
  if (link.target === 'chats') {
    if (link.action === 'create') return params.type === 'direct' ? '/direct/create' : '/chats/create';
    return `/chats${queryString(params)}`;
  }
  if (link.target === 'chat') {
    if (!link.id) return null;
    if (link.action === 'edit') return `/chats/${encodeURIComponent(link.id)}/edit${queryString(params)}`;
    return `/chats/${encodeURIComponent(link.id)}${queryString(params)}`;
  }
  if (link.target === 'settings') {
    return buildSettingsPath({
      tab: params.tab as SettingsTabKey | undefined,
      card: params.card as SettingsCardKey | string | undefined,
    });
  }
  if (link.target === 'recycle_bin') return `/settings/recycle-bin${queryString(params)}`;
  if (link.target === 'calendar') return `/calendar${queryString(params)}`;
  if (link.target === 'moments') return `/moments${queryString(params)}`;
  if (link.target === 'letters') return `/letters${queryString(params)}`;
  if (link.target === 'account') return params.page === 'sync-status' ? '/account/sync-status' : `/account${queryString(params)}`;
  if (link.target === 'membership') return '/membership';
  if (link.target === 'assistant_artifact') return null;
  return null;
}

export function isLikelyExternalLink(href: string | null | undefined) {
  if (!href) return false;
  return /^(https?:|mailto:|tel:|blob:|data:)/i.test(href.trim());
}
