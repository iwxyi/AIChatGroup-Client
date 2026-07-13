export type AssistantArtifactKind = 'document' | 'code' | 'diagram' | 'html' | 'table' | 'json' | 'text';

export interface AssistantArtifactVersion {
  id: string;
  artifactId: string;
  content: string;
  language?: string | null;
  sourceMessageId: string;
  createdAt: number;
}

export interface AssistantArtifactItem {
  id: string;
  chatId: string;
  kind: AssistantArtifactKind;
  title: string;
  summary?: string;
  language?: string | null;
  currentVersionId: string;
  versions: AssistantArtifactVersion[];
  sourceMessageId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface AssistantArtifactDraft {
  kind: AssistantArtifactKind;
  title: string;
  content: string;
  language?: string | null;
  summary?: string;
}
