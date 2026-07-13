import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssistantAgentPatch, AssistantArtifactDraft, AssistantArtifactItem } from '../types/assistantArtifact';
import { scopedStorageKey, storageKey } from '../constants/brand';
import { getLocalDataUserId } from '../services/authStorageScope';
import { createScopedIndexedDbBufferedJsonStorage, flushBufferedPersistenceWrites } from './storePersistenceScope';
import { api } from '../services/api';
import { isCloudSyncEnabled } from '../services/cloudSyncPreference';
import { isAssistantArtifactCloudSyncEnabled } from '../services/assistantArtifactCloudSyncPreference';

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
  moveArtifact: (chatId: string, artifactId: string, direction: 'up' | 'down') => void;
  deleteArtifact: (artifactId: string) => void;
}

const MAX_ARTIFACTS_PER_CHAT = 80;
const MAX_VERSIONS_PER_ARTIFACT = 12;
let assistantArtifactHydrationPromise: Promise<void> | null = null;

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

function scheduleArtifactCloudPush(chatId: string, artifactIds: string[]) {
  if (!shouldSyncAssistantArtifactsToCloud() || !artifactIds.length) return;
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    void useAssistantArtifactStore.getState().pushArtifactsToCloud(chatId, artifactIds).catch(() => undefined);
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
        const result = await api.getAssistantArtifacts(chatId);
        set((state) => ({ items: mergeArtifactItems(state.items, result.items) }));
      },

      pushArtifactsToCloud: async (chatId, artifactIds) => {
        if (!shouldSyncAssistantArtifactsToCloud()) return;
        const items = artifactIds
          ? get().items.filter((item) => item.chatId === chatId && artifactIds.includes(item.id))
          : orderedChatArtifacts(get().items, chatId);
        if (!items.length) return;
        if (items.length === 1) {
          await api.upsertAssistantArtifact(items[0]);
          return;
        }
        await api.upsertAssistantArtifacts(chatId, items);
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
                ? { ...item, sortOrder: nextOrderById.get(item.id) }
                : item
            )),
          };
        });
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
