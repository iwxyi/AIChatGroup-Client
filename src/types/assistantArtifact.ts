export type AssistantArtifactKind = 'document' | 'code' | 'diagram' | 'html' | 'table' | 'json' | 'text';

export interface AssistantArtifactFile {
  id: string;
  path: string;
  content: string;
  language?: string | null;
}

export interface AssistantArtifactVersion {
  id: string;
  artifactId: string;
  content: string;
  files?: AssistantArtifactFile[];
  language?: string | null;
  sourceMessageId: string;
  baseVersionId?: string | null;
  changeSummary?: string;
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
  files?: AssistantArtifactFile[];
  language?: string | null;
  summary?: string;
  targetArtifactId?: string | null;
  action?: 'create' | 'update';
  baseVersionId?: string | null;
  changeSummary?: string;
}

export type AssistantAgentIntent = 'chat' | 'create' | 'update' | 'clarify';
export type AssistantAgentTargetMode = 'single' | 'multi' | 'workspace' | 'selection' | 'unknown';

export interface AssistantAgentChangePlan {
  intent: AssistantAgentIntent;
  scope: {
    targetMode: AssistantAgentTargetMode;
    artifactIds: string[];
  };
  operations: Array<{
    kind: 'style_change' | 'content_edit' | 'structure_edit' | 'create' | 'export' | 'review' | 'other';
    instruction: string;
  }>;
  requiresConfirmation: boolean;
  clarificationQuestion?: string;
  confidence: number;
  rationale?: string;
}

export interface AssistantAgentPatch {
  action: 'create' | 'update';
  artifactId?: string | null;
  kind: AssistantArtifactKind;
  title: string;
  summary?: string;
  language?: string | null;
  content: string;
  files?: AssistantArtifactFile[];
  baseVersionId?: string | null;
  changeSummary?: string;
}

export interface AssistantAgentPatchSet {
  assistantMessage: string;
  patches: AssistantAgentPatch[];
}
