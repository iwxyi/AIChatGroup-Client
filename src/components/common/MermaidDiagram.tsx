import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { memo, useEffect, useId, useState } from 'react';

interface MermaidDiagramProps {
  source: string;
  hideLoading?: boolean;
  onRenderSettled?: () => void;
  onOpenFullscreen?: (payload: { source: string; svg: string; dataUrl: string }) => void;
}

export function estimateMermaidDiagramHeight(source: string) {
  return Math.min(420, Math.max(160, source.split('\n').length * 24 + 80));
}

function MermaidDiagram({ source, hideLoading = false, onRenderSettled, onOpenFullscreen }: MermaidDiagramProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [showSource, setShowSource] = useState(false);
  const reservedHeight = estimateMermaidDiagramHeight(source);

  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setError('');
    void import('mermaid')
      .then(async (module) => {
        const mermaid = module.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          theme: 'default',
        });
        const result = await mermaid.render(`mermaid-${reactId}-${Date.now()}`, source);
        if (!cancelled) {
          setSvg(result.svg);
          onRenderSettled?.();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          onRenderSettled?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onRenderSettled, reactId, source]);

  const openFullscreen = () => {
    if (!svg || !onOpenFullscreen) return;
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    onOpenFullscreen({ source, svg, dataUrl });
  };

  return (
    <Box
      sx={(theme) => ({
        my: 1,
        p: 1,
        borderRadius: 1.25,
        border: '1px solid',
        borderColor: theme.palette.mode === 'light' ? 'rgba(15,23,42,0.10)' : 'rgba(226,232,240,0.14)',
        bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.74)' : 'rgba(15,23,42,0.48)',
        overflowX: 'auto',
        maxWidth: '100%',
        minHeight: hideLoading || svg || error ? undefined : reservedHeight,
      })}
    >
      {!hideLoading && !svg && !error ? (
        <Box sx={{ minHeight: reservedHeight - 16, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
          <CircularProgress size={16} />
        </Box>
      ) : null}
      {svg ? (
        <Box
          sx={{
            minWidth: 0,
            cursor: onOpenFullscreen ? 'zoom-in' : 'default',
            '& svg': {
              maxWidth: 'min(100%, 680px)',
              maxHeight: 'min(58vh, 520px)',
              height: 'auto',
              display: 'block',
            },
          }}
          role={onOpenFullscreen ? 'button' : undefined}
          tabIndex={onOpenFullscreen ? 0 : undefined}
          onClick={openFullscreen}
          onKeyDown={(event) => {
            if (!onOpenFullscreen) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openFullscreen();
            }
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      {error ? (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          <Typography variant="caption" color="error">
            流程图渲染失败
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setShowSource((value) => !value)} sx={{ width: 'fit-content' }}>
            {showSource ? '隐藏源码' : '查看源码'}
          </Button>
        </Box>
      ) : null}
      {showSource ? (
        <Box
          component="pre"
          sx={{
            mt: 1,
            mb: 0,
            p: 1,
            borderRadius: 1,
            overflowX: 'auto',
            bgcolor: 'rgba(15,23,42,0.92)',
            color: '#e5e7eb',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <code>{source}</code>
        </Box>
      ) : null}
    </Box>
  );
}

export default memo(MermaidDiagram);
