import { useEffect, useMemo, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import NavigateBeforeOutlinedIcon from '@mui/icons-material/NavigateBeforeOutlined';
import NavigateNextOutlinedIcon from '@mui/icons-material/NavigateNextOutlined';
import { copyTextToClipboard } from '../../utils/clipboard';
import { ensureAssistantArtifactStoreHydrated, useAssistantArtifactStore } from '../../stores/useAssistantArtifactStore';
import type { AssistantArtifactItem, AssistantArtifactVersion } from '../../types/assistantArtifact';
import AssistantHtmlFrame, { type AssistantHtmlInteractionPayload } from './AssistantHtmlFrame';

function currentVersion(item: AssistantArtifactItem) {
  return item.versions.find((version) => version.id === item.currentVersionId) || item.versions.at(-1) || null;
}

function visibleVersion(item: AssistantArtifactItem, versionId: string | null) {
  const selected = item.versions.find((version) => version.id === versionId) || currentVersion(item);
  const latest = currentVersion(item);
  if (selected && latest?.baseVersionId === selected.id && (latest.stage === 'autosave' || latest.stage === 'submitted')) return latest;
  return selected;
}

function versionLabel(item: AssistantArtifactItem, version: AssistantArtifactVersion | null) {
  if (!version) return '';
  const index = item.versions.findIndex((entry) => entry.id === version.id);
  return index < 0 ? '' : `${index + 1} / ${item.versions.length}`;
}

function downloadHtml(item: AssistantArtifactItem, version: AssistantArtifactVersion) {
  const blob = new Blob([version.content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${item.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'assistant-artifact'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AssistantHtmlFullscreenDialog({ artifactId, onClose, onAutosave, onSubmit }: {
  artifactId: string | null;
  onClose: () => void;
  onAutosave?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onSubmit?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
}) {
  const artifact = useAssistantArtifactStore((state) => state.items.find((item) => item.id === artifactId && item.kind === 'html' && item.deletedAt == null) || null);
  const [versionId, setVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (artifactId) void ensureAssistantArtifactStoreHydrated();
  }, [artifactId]);

  useEffect(() => {
    setVersionId(artifact ? currentVersion(artifact)?.id || null : null);
  }, [artifact?.id]);

  const version = useMemo(() => artifact ? visibleVersion(artifact, versionId) : null, [artifact, versionId]);
  const latestVersion = artifact ? currentVersion(artifact) : null;
  const versionIndex = artifact && version ? artifact.versions.findIndex((entry) => entry.id === version.id) : -1;
  const stepVersion = (direction: -1 | 1) => {
    if (!artifact || versionIndex < 0) return;
    const next = artifact.versions[versionIndex + direction];
    if (next) setVersionId(next.id);
  };

  return (
    <Dialog open={Boolean(artifactId)} onClose={onClose} fullScreen>
      {artifact && version?.htmlRuntime ? (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: { xs: 1, sm: 2 }, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artifact.title}</Typography>
            </Box>
            <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
              <IconButton onClick={() => stepVersion(-1)} disabled={versionIndex <= 0} aria-label="上一版本"><NavigateBeforeOutlinedIcon /></IconButton>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 48, textAlign: 'center' }}>{versionLabel(artifact, version)}</Typography>
              <IconButton onClick={() => stepVersion(1)} disabled={versionIndex < 0 || versionIndex >= artifact.versions.length - 1} aria-label="下一版本"><NavigateNextOutlinedIcon /></IconButton>
              <IconButton onClick={() => void copyTextToClipboard(version.content)} aria-label="复制 HTML"><ContentCopyOutlinedIcon /></IconButton>
              <IconButton onClick={() => downloadHtml(artifact, version)} aria-label="下载 HTML"><DownloadOutlinedIcon /></IconButton>
              <IconButton onClick={onClose} aria-label="关闭 HTML 页面"><CloseOutlinedIcon /></IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent sx={{ p: 0, bgcolor: '#fff' }}>
            <AssistantHtmlFrame
              artifactId={artifact.id}
              version={version}
              manifest={version.htmlRuntime}
              readOnly={version.stage === 'submitted' || (version.id !== latestVersion?.id && version.stage !== 'autosave')}
              onAutosave={onAutosave}
              onSubmit={onSubmit}
            />
          </DialogContent>
        </>
      ) : null}
    </Dialog>
  );
}
