import { Box, IconButton, Tooltip } from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import type { Message } from '../../types/message';
import type { AssistantArtifactItem } from '../../types/assistantArtifact';
import { useAssistantArtifactStore } from '../../stores/useAssistantArtifactStore';
import AssistantHtmlFrame, { type AssistantHtmlInteractionPayload } from './AssistantHtmlFrame';

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

export default function AssistantHtmlMessageBlock({ artifactRef, onAutosave, onSubmit, onOpenArtifact }: {
  artifactRef: ArtifactRef;
  onAutosave?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onSubmit?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const artifact = useAssistantArtifactStore((state) => state.items.find((item) => item.id === artifactRef.id && item.deletedAt == null) || null);
  if (!artifact || artifact.kind !== 'html') return null;
  const version = resolveInlineVersion(artifact, artifactRef);
  const manifest = version?.htmlRuntime;
  if (!version || !manifest || (artifactRef.presentation !== 'inline_html' && manifest.presentation !== 'inline' && manifest.presentation !== 'both')) return null;
  const readOnly = version.stage === 'submitted' || (version.id !== artifact.currentVersionId && version.stage !== 'autosave');
  return (
    <Box sx={{ position: 'relative', width: 'min(100%, 680px)', mt: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
      {onOpenArtifact ? (
        <Tooltip title="全屏打开">
          <IconButton size="small" onClick={() => onOpenArtifact(artifact.id)} sx={{ position: 'absolute', top: 6, right: 6, zIndex: 2, bgcolor: 'rgba(255,255,255,0.86)' }}>
            <OpenInFullIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      <AssistantHtmlFrame artifactId={artifact.id} version={version} manifest={manifest} inline readOnly={readOnly} onAutosave={onAutosave} onSubmit={onSubmit} onOpenFullscreen={() => onOpenArtifact?.(artifact.id)} />
    </Box>
  );
}
