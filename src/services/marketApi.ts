import { storageKey } from '../constants/brand';
import { ApiError } from './api';
import { dispatchAuthSessionExpired } from './authSession';

const API_BASE = '/api';

export type MarketItemKind = 'character_template' | 'chat_template' | 'bundle_template';
export type MarketItemStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export interface MarketItem {
  id: string;
  kind: MarketItemKind;
  ownerUserId: string;
  sourceEntityId?: string | null;
  title: string;
  summary: string;
  coverImage?: string | null;
  status: MarketItemStatus;
  payloadVersion: number;
  reviewNote?: string;
  importedCount: number;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number | null;
  payload?: Record<string, unknown>;
}

export interface MarketUploadPayload {
  kind: MarketItemKind;
  title: string;
  summary?: string;
  coverImage?: string | null;
  payload: Record<string, unknown>;
  sourceEntityId?: string | null;
  marketItemId?: string | null;
}

const AUTH_EXPIRED_CODES = new Set(['AUTH_EXPIRED', 'AUTH_REQUIRED', 'INVALID_TOKEN', 'TOKEN_EXPIRED', 'UNAUTHORIZED']);

function getHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(storageKey('token'));
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json() as Promise<T>;
  throw new ApiError('接口返回了非 JSON 响应', { status: response.status, code: 'INVALID_API_RESPONSE' });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await parseJsonResponse<{ error?: string; detail?: string; code?: string }>(response).catch(() => ({ error: '请求失败', code: 'REQUEST_FAILED' }));
    if (response.status === 401 || (error.code && AUTH_EXPIRED_CODES.has(error.code.toUpperCase()))) {
      dispatchAuthSessionExpired({ status: response.status, path });
    }
    throw new ApiError(error.error || `HTTP ${response.status}`, { status: response.status, code: error.code });
  }
  return parseJsonResponse<T>(response);
}

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export const marketApi = {
  list(params: { kind?: MarketItemKind; limit?: number } = {}) {
    return request<{ items: MarketItem[] }>('GET', `/market${buildQuery(params)}`);
  },
  mine(params: { kind?: MarketItemKind; sourceEntityId?: string | null } = {}) {
    return request<{ items: MarketItem[] }>('GET', `/market/mine${buildQuery(params)}`);
  },
  detail(id: string) {
    return request<{ item: MarketItem }>('GET', `/market/${encodeURIComponent(id)}`);
  },
  upload(payload: MarketUploadPayload) {
    return request<{ item: MarketItem; updated: boolean }>('POST', '/market/items', payload);
  },
  recordImported(id: string) {
    return request<{ ok: boolean }>('POST', `/market/${encodeURIComponent(id)}/imported`);
  },
};
