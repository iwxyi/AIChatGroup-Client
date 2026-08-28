import { useMemo } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { buildAssistantHtmlDocument } from './assistantHtmlDocument';

export default function AssistantHtmlStaticFrame({ artifactId, versionId, title, html, sx }: {
  artifactId: string;
  versionId: string;
  title: string;
  html: string;
  sx?: Record<string, unknown>;
}) {
  const theme = useTheme();
  const srcDoc = useMemo(() => buildAssistantHtmlDocument({
    html,
    manifest: { schemaVersion: 1, presentation: 'fullscreen', executionMode: 'declarative' },
    channelToken: `static-${artifactId}-${versionId}`,
    artifactId,
    versionId,
    readOnly: true,
    displayMode: theme.palette.mode,
  }), [artifactId, html, theme.palette.mode, versionId]);

  return <Box component="iframe" title={title} srcDoc={srcDoc} sandbox="allow-scripts allow-forms" sx={{ bgcolor: theme.palette.mode === 'dark' ? '#181a20' : '#fff', ...sx }} />;
}
