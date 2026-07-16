export type LocalWorkspaceProvider = 'web-file-system-access' | 'native-desktop' | 'native-mobile';

export interface LocalWorkspaceDirectoryMeta {
  id: string;
  name: string;
  provider: LocalWorkspaceProvider;
  addedAt: number;
  updatedAt: number;
  lastPermissionState?: PermissionState | 'unsupported';
  lastError?: string | null;
}

export interface LocalWorkspaceSettingsSnapshot {
  directories: LocalWorkspaceDirectoryMeta[];
  defaultDirectoryId: string | null;
  selectedFilePathsByChatId: Record<string, string[]>;
  chatWriteLocks: Record<string, number>;
}
