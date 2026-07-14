import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { memo, useEffect, useId, useState } from 'react';

interface MermaidDiagramProps {
  source: string;
  hideLoading?: boolean;
  onRenderSettled?: () => void;
}

function MermaidDiagram({ source, hideLoading = false, onRenderSettled }: MermaidDiagramProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [showSource, setShowSource] = useState(false);

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
      })}
    >
      {!hideLoading && !svg && !error ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 1, color: 'text.secondary' }}>
          <CircularProgress size={16} />
        </Box>
      ) : null}
      {svg ? (
        <Box
          sx={{
            minWidth: 0,
            '& svg': {
              maxWidth: '100%',
              height: 'auto',
              display: 'block',
              mx: 'auto',
            },
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
