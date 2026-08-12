import { Box } from '@mui/material';
import type { Message } from '../../types/message';
import type { AssistantArtifactItem } from '../../types/assistantArtifact';
import { useAssistantArtifactStore } from '../../stores/useAssistantArtifactStore';
import AssistantHtmlFrame from './AssistantHtmlFrame';

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

export default function AssistantHtmlMessageBlock({ artifactRef, onOpenArtifact }: {
  artifactRef: ArtifactRef;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const artifact = useAssistantArtifactStore((state) => state.items.find((item) => item.id === artifactRef.id && item.deletedAt == null) || null);
  if (!artifact || artifact.kind !== 'html') return null;
  const version = resolveInlineVersion(artifact, artifactRef);
  const manifest = version?.htmlRuntime;
  if (!version || !manifest) return null;
  const previewManifest = {
    ...manifest,
    viewport: { preferredHeight: 320, maxInlineHeight: 360 },
  };
  return (
    <Box
      role={onOpenArtifact ? 'button' : undefined}
      tabIndex={onOpenArtifact ? 0 : undefined}
      onClick={() => onOpenArtifact?.(artifact.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenArtifact?.(artifact.id);
        }
      }}
      sx={{
        position: 'relative',
        width: 'min(100%, 680px)',
        mt: 0.75,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: '#fff',
        cursor: onOpenArtifact ? 'pointer' : 'default',
        '&:hover': onOpenArtifact ? { borderColor: 'primary.main' } : undefined,
      }}
    >
      <Box sx={{ pointerEvents: 'none' }}>
        <AssistantHtmlFrame artifactId={artifact.id} version={version} manifest={previewManifest} inline readOnly onOpenFullscreen={() => onOpenArtifact?.(artifact.id)} />
      </Box>
    </Box>
  );
}
