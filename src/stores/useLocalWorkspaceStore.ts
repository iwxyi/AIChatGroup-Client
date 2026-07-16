import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GroupChat } from '../types/chat';
import type { AssistantArtifactItem } from '../types/assistantArtifact';
import type { LocalWorkspaceDirectoryMeta, LocalWorkspaceSettingsSnapshot } from '../types/localWorkspace';
import { scopedStorageKey } from '../constants/brand';
import { getLocalDataUserId } from '../services/authStorageScope';
import { createScopedIndexedDbBufferedJsonStorage } from './storePersistenceScope';
import {
  getWebDirectoryPickerSupport,
  isWebDirectoryPickerSupported,
  listLocalWorkspaceFiles,
  pickLocalWorkspaceDirectory,
  readLocalWorkspaceTextFiles,
  removeLocalWorkspaceDirectoryHandle,
  rewriteAssistantChatWorkspace,
  writeAssistantArtifactToLocalWorkspace,
  type LocalWorkspaceFileContext,
  type LocalWorkspaceFileEntry,
} from '../services/localWorkspaceService';

interface LocalWorkspaceStore extends LocalWorkspaceSettingsSnapshot {
  addDirectory: () => Promise<LocalWorkspaceDirectoryMeta>;
  removeDirectory: (id: string) => Promise<void>;
  setDefaultDirectory: (id: string | null) => void;
  markDirectoryStatus: (id: string, patch: Partial<Pick<LocalWorkspaceDirectoryMeta, 'lastPermissionState' | 'lastError'>>) => void;
  getDefaultDirectory: () => LocalWorkspaceDirectoryMeta | null;
  listDefaultDirectoryFiles: () => Promise<LocalWorkspaceFileEntry[]>;
  readDefaultDirectoryTextFiles: (paths: string[]) => Promise<LocalWorkspaceFileContext[]>;
  getSelectedFilePaths: (chatId: string) => string[];
  setSelectedFilePaths: (chatId: string, paths: string[]) => void;
  toggleSelectedFilePath: (chatId: string, path: string) => void;
  clearSelectedFilePaths: (chatId: string) => void;
  isChatWriteLocked: (chatId: string) => boolean;
  mirrorAssistantArtifact: (params: { chat: Pick<GroupChat, 'id' | 'name' | 'type'>; artifact: AssistantArtifactItem }) => Promise<void>;
  mirrorAssistantChatRename: (params: {
    chat: Pick<GroupChat, 'id' | 'name' | 'type'>;
    previousChatName: string;
    artifacts: AssistantArtifactItem[];
  }) => Promise<void>;
}

type LocalWorkspaceSet = (
  partial: Partial<LocalWorkspaceStore> | ((state: LocalWorkspaceStore) => Partial<LocalWorkspaceStore>),
  replace?: false,
) => void;

function getLocalWorkspaceStorageKey() {
  return scopedStorageKey(`local-workspace-${getLocalDataUserId()}`);
}

function normalizeDefaultDirectoryId(directories: LocalWorkspaceDirectoryMeta[], defaultDirectoryId: string | null) {
  if (defaultDirectoryId === null) return null;
  return directories.some((item) => item.id === defaultDirectoryId) ? defaultDirectoryId : null;
}

function clearSelectedFilesIfDefaultChanged(
  state: LocalWorkspaceStore,
  nextDefaultDirectoryId: string | null,
): Record<string, string[]> {
  return state.defaultDirectoryId === nextDefaultDirectoryId ? state.selectedFilePathsByChatId : {};
}

function withChatWriteLock<T>(set: LocalWorkspaceSet, chatId: string, run: () => Promise<T>) {
  set((state) => ({ chatWriteLocks: { ...state.chatWriteLocks, [chatId]: (state.chatWriteLocks[chatId] || 0) + 1 } }));
  return run().finally(() => {
    set((state) => {
      const current = state.chatWriteLocks[chatId] || 0;
      const nextLocks = { ...state.chatWriteLocks };
      if (current <= 1) delete nextLocks[chatId];
      else nextLocks[chatId] = current - 1;
      return { chatWriteLocks: nextLocks };
    });
  });
}

export const useLocalWorkspaceStore = create<LocalWorkspaceStore>()(
  persist(
    (set, get) => ({
      directories: [],
      defaultDirectoryId: null,
      selectedFilePathsByChatId: {},
      chatWriteLocks: {},

      addDirectory: async () => {
        const support = getWebDirectoryPickerSupport();
        if (!support.supported) {
          throw new Error(support.message);
        }
        const directory = await pickLocalWorkspaceDirectory();
        set((state) => {
          const hadDirectories = state.directories.length > 0;
          const directories = [directory, ...state.directories.filter((item) => item.id !== directory.id)];
          return {
            directories,
            defaultDirectoryId: hadDirectories ? normalizeDefaultDirectoryId(directories, state.defaultDirectoryId) : directory.id,
          };
        });
        return directory;
      },

      removeDirectory: async (id) => {
        await removeLocalWorkspaceDirectoryHandle(id);
        set((state) => {
          const directories = state.directories.filter((item) => item.id !== id);
          const defaultDirectoryId = normalizeDefaultDirectoryId(directories, state.defaultDirectoryId === id ? null : state.defaultDirectoryId);
          return {
            directories,
            defaultDirectoryId,
            selectedFilePathsByChatId: clearSelectedFilesIfDefaultChanged(state, defaultDirectoryId),
          };
        });
      },

      setDefaultDirectory: (id) => {
        set((state) => {
          const defaultDirectoryId = normalizeDefaultDirectoryId(state.directories, id);
          return {
            defaultDirectoryId,
            selectedFilePathsByChatId: clearSelectedFilesIfDefaultChanged(state, defaultDirectoryId),
          };
        });
      },

      markDirectoryStatus: (id, patch) => {
        set((state) => ({
          directories: state.directories.map((directory) => (
            directory.id === id
              ? {
                ...directory,
                ...patch,
                updatedAt: Date.now(),
              }
              : directory
          )),
        }));
      },

      getDefaultDirectory: () => {
        const state = get();
        const id = normalizeDefaultDirectoryId(state.directories, state.defaultDirectoryId);
        return id ? state.directories.find((item) => item.id === id) || null : null;
      },

      listDefaultDirectoryFiles: async () => {
        const directory = get().getDefaultDirectory();
        if (!directory) return [];
        try {
          const files = await listLocalWorkspaceFiles({ directory });
          get().markDirectoryStatus(directory.id, { lastPermissionState: 'granted', lastError: null });
          return files;
        } catch (error) {
          get().markDirectoryStatus(directory.id, {
            lastError: error instanceof Error ? error.message : '读取本地文件列表失败',
          });
          throw error;
        }
      },

      readDefaultDirectoryTextFiles: async (paths) => {
        const directory = get().getDefaultDirectory();
        if (!directory) return [];
        try {
          const files = await readLocalWorkspaceTextFiles({ directory, paths });
          get().markDirectoryStatus(directory.id, { lastPermissionState: 'granted', lastError: null });
          return files;
        } catch (error) {
          get().markDirectoryStatus(directory.id, {
            lastError: error instanceof Error ? error.message : '读取本地文件失败',
          });
          throw error;
        }
      },

      getSelectedFilePaths: (chatId) => get().selectedFilePathsByChatId[chatId] || [],

      setSelectedFilePaths: (chatId, paths) => {
        const normalized = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean))).slice(0, 12);
        set((state) => ({
          selectedFilePathsByChatId: {
            ...state.selectedFilePathsByChatId,
            [chatId]: normalized,
          },
        }));
      },

      toggleSelectedFilePath: (chatId, path) => {
        const normalizedPath = path.trim();
        if (!normalizedPath) return;
        const current = get().getSelectedFilePaths(chatId);
        get().setSelectedFilePaths(
          chatId,
          current.includes(normalizedPath)
            ? current.filter((item) => item !== normalizedPath)
            : [...current, normalizedPath],
        );
      },

      clearSelectedFilePaths: (chatId) => {
        set((state) => {
          if (!state.selectedFilePathsByChatId[chatId]?.length) return {};
          const next = { ...state.selectedFilePathsByChatId };
          delete next[chatId];
          return { selectedFilePathsByChatId: next };
        });
      },

      isChatWriteLocked: (chatId) => Boolean(get().chatWriteLocks[chatId]),

      mirrorAssistantArtifact: async ({ chat, artifact }) => {
        if (chat.type !== 'assistant') return;
        const directory = get().getDefaultDirectory();
        if (!directory) return;
        await withChatWriteLock(set, chat.id, async () => {
          try {
            await writeAssistantArtifactToLocalWorkspace({ chat, artifact, directory });
            get().markDirectoryStatus(directory.id, { lastPermissionState: 'granted', lastError: null });
          } catch (error) {
            get().markDirectoryStatus(directory.id, {
              lastError: error instanceof Error ? error.message : '本地产物写入失败',
            });
            throw error;
          }
        });
      },

      mirrorAssistantChatRename: async ({ chat, previousChatName, artifacts }) => {
        if (chat.type !== 'assistant') return;
        const directory = get().getDefaultDirectory();
        if (!directory) return;
        await withChatWriteLock(set, chat.id, async () => {
          try {
            await rewriteAssistantChatWorkspace({ directory, chat, previousChatName, artifacts });
            get().markDirectoryStatus(directory.id, { lastPermissionState: 'granted', lastError: null });
          } catch (error) {
            get().markDirectoryStatus(directory.id, {
              lastError: error instanceof Error ? error.message : '本地聊天目录改名失败',
            });
            throw error;
          }
        });
      },
    }),
    {
      name: scopedStorageKey('local-workspace'),
      storage: createScopedIndexedDbBufferedJsonStorage<LocalWorkspaceSettingsSnapshot>({
        getScopedKey: getLocalWorkspaceStorageKey,
        storageName: scopedStorageKey('local-workspace'),
        flushDelayMs: 100,
      }),
      partialize: (state) => ({
        directories: state.directories,
        defaultDirectoryId: state.defaultDirectoryId,
        selectedFilePathsByChatId: state.selectedFilePathsByChatId,
        chatWriteLocks: {},
      }),
    },
  ),
);
