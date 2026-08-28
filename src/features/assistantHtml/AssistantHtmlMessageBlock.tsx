import { Box } from '@mui/material';
import type { Message } from '../../types/message';
import type { AssistantArtifactItem } from '../../types/assistantArtifact';
import { useAssistantArtifactStore } from '../../stores/useAssistantArtifactStore';
import AssistantHtmlFrame, { type AssistantHtmlInteractionPayload } from './AssistantHtmlFrame';
import { logDeveloperDiagnostic } from '../../services/developerDiagnostics';

type ArtifactRef = NonNullable<NonNullable<NonNullable<Message['metadata']>['assistant']>['artifacts']>[number];

function resolveInlineVersion(artifact: AssistantArtifactItem, ref: ArtifactRef) {
  const referenced = artifact.versions.find((version) => version.id === ref.versionId)
    || artifact.versions.find((version) => version.id === artifact.currentVersionId)
    || artifact.versions.at(-1);
  if (!referenced) return null;
  const attempt = artifact.versions
    .filter((version) => version.baseVersionId === referenced.id && (version.stage === 'autosave' || version.stage === 'submitted'))
    .sort((left, right) => (right.updatedAt || right.createdAt) - (left.updatedAt || left.createdAt))[0];
  return attempt || referenced;
}

export default function AssistantHtmlMessageBlock({ artifactRef, onAutosave, onSubmit, onOpenArtifact, onOpenFullscreen }: {
  artifactRef: ArtifactRef;
  onAutosave?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onSubmit?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenFullscreen?: (artifactId: string) => void;
}) {
  const artifact = useAssistantArtifactStore((state) => state.items.find((item) => item.id === artifactRef.id && item.deletedAt == null) || null);
  if (!artifact || artifact.kind !== 'html') return null;
  const version = resolveInlineVersion(artifact, artifactRef);
  const manifest = version?.htmlRuntime;
  if (!version || !manifest) return null;
  const interactive = Boolean(manifest.submission)
    && artifactRef.presentation !== 'fullscreen_html'
    && (manifest.presentation === 'inline' || manifest.presentation === 'both');
  const readOnly = version.id !== artifact.currentVersionId && version.stage !== 'autosave';
  if (interactive) {
    return (
      <Box sx={{ width: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: 'background.paper' }}>
        <AssistantHtmlFrame
          artifactId={artifact.id}
          version={version}
          manifest={manifest}
          inline
          readOnly={readOnly}
          onAutosave={onAutosave}
          onSubmit={onSubmit}
        />
      </Box>
    );
  }
  const previewManifest = {
    ...manifest,
    viewport: { preferredHeight: 200, maxInlineHeight: 220 },
  };
  return (
    <Box
      role={onOpenFullscreen ? 'button' : undefined}
      tabIndex={onOpenFullscreen ? 0 : undefined}
      onClick={() => {
        logDeveloperDiagnostic('html-artifact:click', { artifactId: artifact.id, hasOpenHandler: Boolean(onOpenFullscreen), presentation: artifactRef.presentation || null }, 'info', 'chat-window');
        onOpenFullscreen?.(artifact.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          logDeveloperDiagnostic('html-artifact:keyboard-open', { artifactId: artifact.id, hasOpenHandler: Boolean(onOpenFullscreen) }, 'info', 'chat-window');
          onOpenFullscreen?.(artifact.id);
        }
      }}
      sx={{
        position: 'relative',
        width: 'min(100%, 560px)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        cursor: onOpenFullscreen ? 'pointer' : 'default',
        '&:hover': onOpenFullscreen ? { borderColor: 'primary.main' } : undefined,
      }}
    >
      <Box sx={{ pointerEvents: 'none' }}>
        <AssistantHtmlFrame artifactId={artifact.id} version={version} manifest={previewManifest} inline readOnly interactive={false} onOpenFullscreen={() => onOpenFullscreen?.(artifact.id)} />
      </Box>
    </Box>
  );
}
