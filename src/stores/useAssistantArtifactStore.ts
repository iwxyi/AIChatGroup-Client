import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssistantAgentPatch, AssistantArtifactDraft, AssistantArtifactItem } from '../types/assistantArtifact';
import type { Message, MessageAttachment } from '../types/message';
import { scopedStorageKey, storageKey } from '../constants/brand';
import { getLocalDataUserId } from '../services/authStorageScope';
import { createScopedIndexedDbBufferedJsonStorage, flushBufferedPersistenceWrites } from './storePersistenceScope';
import { api } from '../services/api';
import type { SyncChangeScope } from '../services/api';
import { isCloudSyncEnabled } from '../services/cloudSyncPreference';
import { isAssistantArtifactCloudSyncEnabled } from '../services/assistantArtifactCloudSyncPreference';
import { createSyncScopeMetadata } from './syncScopeMetadata';
import { useChatStore } from './useChatStore';
import { useLocalWorkspaceStore } from './useLocalWorkspaceStore';

interface AssistantArtifactSnapshot {
  items: AssistantArtifactItem[];
}

interface AssistantArtifactStore extends AssistantArtifactSnapshot {
  upsertArtifactsFromMessage: (params: {
    chatId: string;
    messageId: string;
    drafts: AssistantArtifactDraft[];
    timestamp?: number;
  }) => AssistantArtifactItem[];
  commitPatchSet: (params: {
    chatId: string;
    messageId: string;
    patches: AssistantAgentPatch[];
    timestamp?: number;
  }) => AssistantArtifactItem[];
  getArtifactsForChat: (chatId: string) => AssistantArtifactItem[];
  refreshArtifactsFromCloud: (chatId: string) => Promise<void>;
  pushArtifactsToCloud: (chatId: string, artifactIds?: string[]) => Promise<void>;
  createImageArtifactFromAttachment: (params: {
    chatId: string;
    message: Message;
    attachment: MessageAttachment;
    timestamp?: number;
  }) => AssistantArtifactItem | null;
  moveArtifact: (chatId: string, artifactId: string, direction: 'up' | 'down') => void;
  deleteArtifact: (artifactId: string) => void;
}

const MAX_ARTIFACTS_PER_CHAT = 80;
const MAX_VERSIONS_PER_ARTIFACT = 12;
const ASSISTANT_ARTIFACT_SYNC_TTL_MS = 30_000;
let assistantArtifactHydrationPromise: Promise<void> | null = null;
const assistantArtifactSyncScopes = createSyncScopeMetadata(ASSISTANT_ARTIFACT_SYNC_TTL_MS, {
  getStorageKey: () => scopedStorageKey(`assistant-artifact-sync-scopes-${getLocalDataUserId()}`),
});

function shouldSyncAssistantArtifactsToCloud() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(storageKey('auth-mode')) === 'cloud'
    && isCloudSyncEnabled()
    && isAssistantArtifactCloudSyncEnabled();
}

function getAssistantArtifactStorageKey() {
  return scopedStorageKey(`assistant-artifacts-${getLocalDataUserId()}`);
}

function createArtifactId(chatId: string, now: number, index: number) {
  return `assistant-artifact-${chatId}-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function createVersionId(artifactId: string, now: number) {
  return `${artifactId}:v:${now}:${Math.random().toString(36).slice(2, 6)}`;
}

function createOperationId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function artifactPayloadForCloud(item: AssistantArtifactItem) {
  return {
    ...item,
    baseRevision: item.revision || null,
    operationId: createOperationId(item.id),
  };
}

function findTargetArtifact(items: AssistantArtifactItem[], chatId: string, draft: AssistantArtifactDraft) {
  if (draft.action !== 'update' || !draft.targetArtifactId) return null;
  return items.find((item) => item.id === draft.targetArtifactId && item.chatId === chatId && item.deletedAt == null) || null;
}

function draftFromPatch(patch: AssistantAgentPatch): AssistantArtifactDraft {
  return {
    action: patch.action,
    targetArtifactId: patch.action === 'update' ? patch.artifactId || null : null,
    kind: patch.kind,
    title: patch.title,
    summary: patch.summary,
    language: patch.language || null,
    content: patch.content,
    files: patch.files,
    baseVersionId: patch.baseVersionId || null,
    changeSummary: patch.changeSummary,
    media: patch.media,
  };
}

function pruneChatArtifacts(items: AssistantArtifactItem[], chatId: string) {
  const chatItems = items.filter((item) => item.chatId === chatId && item.deletedAt == null).sort((a, b) => b.updatedAt - a.updatedAt);
  if (chatItems.length <= MAX_ARTIFACTS_PER_CHAT) return items;
  const keepIds = new Set(chatItems.slice(0, MAX_ARTIFACTS_PER_CHAT).map((item) => item.id));
  return items.map((item) => (
    item.chatId === chatId && item.deletedAt == null && !keepIds.has(item.id)
      ? { ...item, deletedAt: Date.now(), updatedAt: Date.now() }
      : item
  ));
}

function orderedChatArtifacts(items: AssistantArtifactItem[], chatId: string) {
  return items
    .filter((item) => item.chatId === chatId && item.deletedAt == null)
    .sort((a, b) => {
      const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.updatedAt - a.updatedAt;
    });
}

function mergeArtifactItems(localItems: AssistantArtifactItem[], incomingItems: AssistantArtifactItem[]) {
  if (!incomingItems.length) return localItems;
  const byId = new Map(localItems.map((item) => [item.id, item]));
  for (const incoming of incomingItems) {
    const existing = byId.get(incoming.id);
    if (!existing || (incoming.updatedAt || 0) >= (existing.updatedAt || 0)) {
      byId.set(incoming.id, incoming);
    }
  }
  return Array.from(byId.values());
}

function mergeCloudArtifacts(incomingItems: AssistantArtifactItem[]) {
  if (!incomingItems.length) return;
  useAssistantArtifactStore.setState((state) => ({ items: mergeArtifactItems(state.items, incomingItems) }));
}

function assistantArtifactSyncScope(chatId: string): SyncChangeScope {
  return `assistant-artifacts:${chatId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeCloudArtifactPatch(change: Record<string, unknown>, chatId: string): AssistantArtifactItem | null {
  if (change.entity !== 'assistant_artifact' || typeof change.id !== 'string') return null;
  const patch = isRecord(change.patch) ? change.patch : null;
  if (!patch || patch.chatId !== chatId || typeof patch.kind !== 'string') return null;
  const versions = Array.isArray(patch.versions) ? patch.versions : [];
  return {
    id: change.id,
    chatId,
    kind: patch.kind as AssistantArtifactItem['kind'],
    title: typeof patch.title === 'string' ? patch.title : '未命名产物',
    summary: typeof patch.summary === 'string' ? patch.summary : undefined,
    language: typeof patch.language === 'string' ? patch.language : null,
    currentVersionId: typeof patch.currentVersionId === 'string' ? patch.currentVersionId : '',
    versions: versions as AssistantArtifactItem['versions'],
    sourceMessageId: typeof patch.sourceMessageId === 'string' ? patch.sourceMessageId : '',
    createdAt: Number(patch.createdAt || 0),
    updatedAt: Number(patch.updatedAt || change.revision || 0),
    sortOrder: typeof patch.sortOrder === 'number' ? patch.sortOrder : undefined,
    deletedAt: patch.deletedAt == null ? null : Number(patch.deletedAt),
    revision: Number(patch.revision || change.revision || 1),
  };
}

async function refreshArtifactsViaSyncChanges(chatId: string) {
  const scope = assistantArtifactSyncScope(chatId);
  const state = assistantArtifactSyncScopes.getState(scope);
  const since = state.cursor ?? state.revision ?? null;
  const result = await api.getSyncChanges({ scope, since });
  if (result.status === 'modified') {
    const incomingItems = result.changes
      .map((change) => normalizeCloudArtifactPatch(change, chatId))
      .filter((item): item is AssistantArtifactItem => Boolean(item));
    mergeCloudArtifacts(incomingItems);
  }
  assistantArtifactSyncScopes.markChecked(scope, {
    cursor: result.cursor,
    revision: result.revision,
    applied: result.status === 'modified',
  });
}

async function refreshArtifactsViaLegacyEndpoint(chatId: string) {
  const result = await api.getAssistantArtifacts(chatId);
  useAssistantArtifactStore.setState((state) => ({ items: mergeArtifactItems(state.items, result.items) }));
  assistantArtifactSyncScopes.markChecked(assistantArtifactSyncScope(chatId), { applied: true, fresh: false });
}

function scheduleArtifactCloudPush(chatId: string, artifactIds: string[]) {
  if (!shouldSyncAssistantArtifactsToCloud() || !artifactIds.length) return;
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    void useAssistantArtifactStore.getState().pushArtifactsToCloud(chatId, artifactIds).catch(() => undefined);
  }, 0);
}

function scheduleArtifactLocalWorkspaceWrite(chatId: string, artifacts: AssistantArtifactItem[]) {
  if (!artifacts.length || typeof window === 'undefined') return;
  window.setTimeout(() => {
    const chat = useChatStore.getState().chats.find((item) => item.id === chatId);
    if (!chat || chat.type !== 'assistant') return;
    const workspace = useLocalWorkspaceStore.getState();
    if (!workspace.getDefaultDirectory()) return;
    void Promise.allSettled(
      artifacts.map((artifact) => workspace.mirrorAssistantArtifact({ chat, artifact })),
    ).then((results) => {
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (rejected) console.warn('[assistant-artifact:local-workspace-write-failed]', rejected.reason);
    });
  }, 0);
}

export const useAssistantArtifactStore = create<AssistantArtifactStore>()(
  persist(
    (set, get) => ({
      items: [],

      upsertArtifactsFromMessage: ({ chatId, messageId, drafts, timestamp }) => {
        if (!drafts.length) return [];
        const now = timestamp || Date.now();
        const changed: AssistantArtifactItem[] = [];
        set((state) => {
          let nextItems = [...state.items];
          drafts.forEach((draft, index) => {
            const existing = findTargetArtifact(nextItems, chatId, draft);
            const artifactId = existing?.id || createArtifactId(chatId, now, index);
            const version = {
              id: createVersionId(artifactId, now + index),
              artifactId,
              content: draft.content,
              files: draft.files,
              language: draft.language || null,
              sourceMessageId: messageId,
              baseVersionId: draft.baseVersionId || existing?.currentVersionId || null,
              changeSummary: draft.changeSummary,
              media: draft.media,
              createdAt: now + index,
            };
            if (existing) {
              const previousVersion = existing.versions.find((item) => item.content.trim() === draft.content.trim());
              const updated = previousVersion ? {
                ...existing,
                summary: draft.summary || existing.summary,
                updatedAt: now + index,
              } : {
                ...existing,
                title: draft.title || existing.title,
                summary: draft.summary || existing.summary,
                language: draft.language || existing.language || null,
                currentVersionId: version.id,
                versions: [...existing.versions, version].slice(-MAX_VERSIONS_PER_ARTIFACT),
                sourceMessageId: messageId,
                updatedAt: now + index,
              };
              nextItems = nextItems.map((item) => item.id === existing.id ? updated : item);
              changed.push(updated);
              return;
            }
            const created: AssistantArtifactItem = {
              id: artifactId,
              chatId,
              kind: draft.kind,
              title: draft.title,
              summary: draft.summary,
              language: draft.language || null,
              currentVersionId: version.id,
              versions: [version],
              sourceMessageId: messageId,
              createdAt: now + index,
              updatedAt: now + index,
              sortOrder: now + index,
              deletedAt: null,
            };
              nextItems.unshift(created);
              changed.push(created);
            });
          return { items: pruneChatArtifacts(nextItems, chatId) };
        });
        scheduleArtifactCloudPush(chatId, changed.map((item) => item.id));
        scheduleArtifactLocalWorkspaceWrite(chatId, changed);
        return changed;
      },

      commitPatchSet: ({ chatId, messageId, patches, timestamp }) => get().upsertArtifactsFromMessage({
        chatId,
        messageId,
        drafts: patches.map(draftFromPatch),
        timestamp,
      }),

      getArtifactsForChat: (chatId) => orderedChatArtifacts(get().items, chatId),

      refreshArtifactsFromCloud: async (chatId) => {
        if (!shouldSyncAssistantArtifactsToCloud()) return;
        const scope = assistantArtifactSyncScope(chatId);
        await assistantArtifactSyncScopes.run(scope, async () => {
          try {
            await refreshArtifactsViaSyncChanges(chatId);
          } catch (error) {
            assistantArtifactSyncScopes.markError(scope, error);
            await refreshArtifactsViaLegacyEndpoint(chatId);
          }
        }, { markCheckedOnSuccess: false });
      },

      pushArtifactsToCloud: async (chatId, artifactIds) => {
        if (!shouldSyncAssistantArtifactsToCloud()) return;
        const items = artifactIds
          ? get().items.filter((item) => item.chatId === chatId && artifactIds.includes(item.id))
          : orderedChatArtifacts(get().items, chatId);
        if (!items.length) return;
        if (items.length === 1) {
          const result = await api.upsertAssistantArtifact(artifactPayloadForCloud(items[0]));
          mergeCloudArtifacts([result.item]);
          return;
        }
        const result = await api.upsertAssistantArtifacts(chatId, items.map(artifactPayloadForCloud));
        mergeCloudArtifacts(result.items);
      },

      createImageArtifactFromAttachment: ({ chatId, message, attachment, timestamp }) => {
        if (attachment.kind !== 'image' || attachment.status !== 'ready' || !attachment.assetId) return null;
        const now = timestamp || Date.now();
        const artifactId = `assistant-image-artifact-${message.id}-${attachment.id}`;
        const existing = get().items.find((item) => item.id === artifactId && item.chatId === chatId) || null;
        const versionId = existing?.currentVersionId || createVersionId(artifactId, now);
        const media = [{
          assetId: attachment.assetId,
          thumbnailAssetId: attachment.thumbnailAssetId,
          url: attachment.url,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          width: attachment.width,
          height: attachment.height,
          checksum: attachment.checksum,
          alt: attachment.altText,
        }];
        const content = JSON.stringify({ media, promptText: attachment.promptText || '', alt: attachment.altText || '' }, null, 2);
        const imageVersion = {
          id: versionId,
          artifactId,
          content,
          media,
          language: 'json',
          sourceMessageId: message.id,
          baseVersionId: existing?.currentVersionId || null,
          changeSummary: existing ? '更新图片资产引用' : '创建图片产物',
          createdAt: now,
        };
        const item: AssistantArtifactItem = existing ? {
          ...existing,
          title: attachment.altText || existing.title || '图片产物',
          summary: attachment.promptText || existing.summary,
          currentVersionId: versionId,
          versions: [imageVersion],
          sourceMessageId: message.id,
          updatedAt: now,
          deletedAt: null,
        } : {
          id: artifactId,
          chatId,
          kind: 'image',
          title: attachment.altText || '图片产物',
          summary: attachment.promptText || undefined,
          language: 'json',
          currentVersionId: versionId,
          versions: [imageVersion],
          sourceMessageId: message.id,
          createdAt: now,
          updatedAt: now,
          sortOrder: now,
          deletedAt: null,
        };
        set((state) => ({
          items: existing
            ? state.items.map((entry) => entry.id === item.id ? item : entry)
            : [item, ...state.items],
        }));
        scheduleArtifactCloudPush(chatId, [item.id]);
        scheduleArtifactLocalWorkspaceWrite(chatId, [item]);
        return item;
      },

      moveArtifact: (chatId, artifactId, direction) => {
        set((state) => {
          const ordered = orderedChatArtifacts(state.items, chatId);
          const currentIndex = ordered.findIndex((item) => item.id === artifactId);
          const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
          if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return state;
          const nextOrdered = [...ordered];
          const [moved] = nextOrdered.splice(currentIndex, 1);
          if (!moved) return state;
          nextOrdered.splice(targetIndex, 0, moved);
          const nextOrderById = new Map(nextOrdered.map((item, index) => [item.id, index + 1]));
          return {
            items: state.items.map((item) => (
              item.chatId === chatId && nextOrderById.has(item.id)
                ? { ...item, sortOrder: nextOrderById.get(item.id), updatedAt: Date.now() }
                : item
            )),
          };
        });
        scheduleArtifactCloudPush(chatId, [artifactId]);
      },

      deleteArtifact: (artifactId) => {
        const now = Date.now();
        const target = get().items.find((item) => item.id === artifactId);
        set((state) => ({
          items: state.items.map((item) => item.id === artifactId ? { ...item, deletedAt: now, updatedAt: now } : item),
        }));
        if (target) scheduleArtifactCloudPush(target.chatId, [artifactId]);
      },
    }),
    {
      name: scopedStorageKey('assistant-artifacts'),
      storage: createScopedIndexedDbBufferedJsonStorage<AssistantArtifactSnapshot>({
        getScopedKey: getAssistantArtifactStorageKey,
        storageName: scopedStorageKey('assistant-artifacts'),
        flushDelayMs: 120,
      }),
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => () => {
        flushBufferedPersistenceWrites();
      },
    },
  ),
);

export function getAssistantArtifactCurrentContent(item: AssistantArtifactItem) {
  const fallbackVersion = item.versions.length ? item.versions[item.versions.length - 1] : null;
  const version = item.versions.find((entry) => entry.id === item.currentVersionId) || fallbackVersion;
  if (!version) return '';
  if (version.files?.length) {
    return version.files
      .map((file) => `// ${file.path}\n${file.content}`)
      .join('\n\n');
  }
  return version.content || '';
}

export function ensureAssistantArtifactStoreHydrated() {
  if (useAssistantArtifactStore.persist.hasHydrated()) return Promise.resolve();
  assistantArtifactHydrationPromise ??= Promise.resolve(useAssistantArtifactStore.persist.rehydrate()).finally(() => {
    assistantArtifactHydrationPromise = null;
  });
  return assistantArtifactHydrationPromise;
}
