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

export type AssistantArtifactVersionStage = 'generated' | 'autosave' | 'submitted' | 'ai_result' | 'user_revision';

export interface AssistantHtmlSubmissionField {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'single_choice' | 'multi_choice';
  label?: string;
  required?: boolean;
  maxLength?: number;
  options?: string[];
}

export interface AssistantHtmlRuntimeManifest {
  schemaVersion: 1;
  presentation: 'inline' | 'fullscreen' | 'both';
  executionMode: 'declarative';
  viewport?: {
    preferredHeight?: number;
    maxInlineHeight?: number;
  };
  autosave?: {
    enabled: true;
    debounceMs?: number;
  };
  submission?: {
    interactionId: string;
    label: string;
    resultType: 'form' | 'quiz' | 'selection' | 'custom';
    fields: AssistantHtmlSubmissionField[];
    sendToAssistant: true;
    createArtifactVersion: true;
  };
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
  htmlRuntime?: AssistantHtmlRuntimeManifest;
  stage?: AssistantArtifactVersionStage;
  interactionState?: Record<string, unknown>;
  updatedAt?: number;
  revision?: number;
  submissionId?: string;
  submittedAt?: number;
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
  htmlRuntime?: AssistantHtmlRuntimeManifest;
  versionStage?: AssistantArtifactVersionStage;
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
  htmlRuntime?: AssistantHtmlRuntimeManifest;
  versionStage?: AssistantArtifactVersionStage;
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
