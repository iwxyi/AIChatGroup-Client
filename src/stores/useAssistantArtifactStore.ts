import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssistantAgentPatch, AssistantArtifactDraft, AssistantArtifactItem } from '../types/assistantArtifact';
import { scopedStorageKey } from '../constants/brand';
import { getLocalDataUserId } from '../services/authStorageScope';
import { createScopedIndexedDbBufferedJsonStorage, flushBufferedPersistenceWrites } from './storePersistenceScope';

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
  deleteArtifact: (artifactId: string) => void;
}

const MAX_ARTIFACTS_PER_CHAT = 80;
const MAX_VERSIONS_PER_ARTIFACT = 12;
let assistantArtifactHydrationPromise: Promise<void> | null = null;

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
              deletedAt: null,
            };
            nextItems.unshift(created);
            changed.push(created);
          });
          return { items: pruneChatArtifacts(nextItems, chatId) };
        });
        return changed;
      },

      commitPatchSet: ({ chatId, messageId, patches, timestamp }) => get().upsertArtifactsFromMessage({
        chatId,
        messageId,
        drafts: patches.map(draftFromPatch),
        timestamp,
      }),

      getArtifactsForChat: (chatId) => get().items
        .filter((item) => item.chatId === chatId && item.deletedAt == null)
        .sort((a, b) => b.updatedAt - a.updatedAt),

      deleteArtifact: (artifactId) => {
        const now = Date.now();
        set((state) => ({
          items: state.items.map((item) => item.id === artifactId ? { ...item, deletedAt: now, updatedAt: now } : item),
        }));
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
