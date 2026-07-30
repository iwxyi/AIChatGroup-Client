export type AssistantArtifactKind = 'document' | 'code' | 'diagram' | 'html' | 'table' | 'json' | 'text' | 'image';

export interface AssistantArtifactMediaRef {
  assetId: string;
  thumbnailAssetId?: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  checksum?: string;
  alt?: string;
}

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
  media?: AssistantArtifactMediaRef[];
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
  sortOrder?: number;
  deletedAt?: number | null;
  revision?: number;
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
  media?: AssistantArtifactMediaRef[];
}

export type AssistantAgentIntent = 'chat' | 'create' | 'update' | 'clarify' | 'search';
export type AssistantAgentTargetMode = 'single' | 'multi' | 'workspace' | 'selection' | 'unknown';

export interface AssistantAgentLocalFileRef {
  directoryId: string;
  path: string;
}

export interface AssistantAgentLocalFileContext extends AssistantAgentLocalFileRef {
  name: string;
  mimeType?: string;
  sizeBytes: number;
  content: string;
  truncated: boolean;
  originalLength: number;
}

export interface AssistantAgentChangePlan {
  intent: AssistantAgentIntent;
  assistantMessage?: string;
  scope: {
    targetMode: AssistantAgentTargetMode;
    artifactIds: string[];
  };
  operations: Array<{
    kind: 'style_change' | 'content_edit' | 'structure_edit' | 'create' | 'export' | 'review' | 'search' | 'other';
    instruction: string;
  }>;
  requiresConfirmation: boolean;
  clarificationQuestion?: string;
  searchQuery?: string;
  localFilePaths?: AssistantAgentLocalFileRef[];
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
  media?: AssistantArtifactMediaRef[];
}

export interface AssistantAgentMediaTask {
  kind: 'image';
  slotId?: string;
  prompt: string;
  altText: string;
  userCaption?: string;
  aspectRatio?: string;
  imageSize?: string;
  targetArtifactId?: string;
  targetImageIds?: string[];
  referenceImageIds?: string[];
  styleImageIds?: string[];
  referenceImages?: Array<{
    url: string;
    mimeType?: string;
    label?: string;
  }>;
}

export interface AssistantAgentPatchSet {
  assistantMessage: string;
  patches: AssistantAgentPatch[];
  mediaTasks?: AssistantAgentMediaTask[];
}
