import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { memo, useEffect, useId, useRef, useState } from 'react';

interface MermaidDiagramProps {
  source: string;
  hideLoading?: boolean;
  onRenderSettled?: () => void;
  onOpenFullscreen?: (payload: { source: string; svg: string; dataUrl: string }) => void;
}

export function estimateMermaidDiagramHeight(source: string) {
  return Math.min(420, Math.max(160, source.split('\n').length * 24 + 80));
}

const MERMAID_RENDER_CACHE_LIMIT = 100;
const mermaidRenderCache = new Map<string, { svg?: string; error?: string }>();

function parseSvgIntrinsicSize(svgText: string) {
  const viewBoxMatch = svgText.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBoxMatch) {
    const width = Number(viewBoxMatch[1]);
    const height = Number(viewBoxMatch[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  const widthMatch = svgText.match(/\bwidth=["']([\d.]+)(?:px)?["']/i);
  const heightMatch = svgText.match(/\bheight=["']([\d.]+)(?:px)?["']/i);
  const width = Number(widthMatch?.[1] || 0);
  const height = Number(heightMatch?.[1] || 0);
  if (width > 0 && height > 0) return { width, height };
  return { width: 680, height: 420 };
}

function cacheMermaidRender(source: string, result: { svg?: string; error?: string }) {
  if (mermaidRenderCache.has(source)) mermaidRenderCache.delete(source);
  mermaidRenderCache.set(source, result);
  while (mermaidRenderCache.size > MERMAID_RENDER_CACHE_LIMIT) {
    const oldestKey = mermaidRenderCache.keys().next().value;
    if (oldestKey === undefined) break;
    mermaidRenderCache.delete(oldestKey);
  }
}

function MermaidDiagram({ source, hideLoading = false, onRenderSettled, onOpenFullscreen }: MermaidDiagramProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const cachedRender = mermaidRenderCache.get(source);
  const [svg, setSvg] = useState(cachedRender?.svg || '');
  const [error, setError] = useState(cachedRender?.error || '');
  const [showSource, setShowSource] = useState(false);
  const onRenderSettledRef = useRef(onRenderSettled);
  const reservedHeight = estimateMermaidDiagramHeight(source);
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  const svgSize = svg ? parseSvgIntrinsicSize(svg) : null;
  const svgRatio = svgSize ? svgSize.width / svgSize.height : 1.6;
  const maxHeight = Math.min(viewportHeight * 0.52, 480);
  const widthLimitByHeight = Math.max(180, maxHeight * svgRatio);

  useEffect(() => {
    onRenderSettledRef.current = onRenderSettled;
  }, [onRenderSettled]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  useEffect(() => {
    const cached = mermaidRenderCache.get(source);
    if (cached?.svg) {
      setSvg(cached.svg);
      setError('');
      onRenderSettledRef.current?.();
      return undefined;
    }
    if (cached?.error) {
      setSvg('');
      setError(cached.error);
      onRenderSettledRef.current?.();
      return undefined;
    }

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
          cacheMermaidRender(source, { svg: result.svg });
          setSvg(result.svg);
          onRenderSettledRef.current?.();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const nextError = err instanceof Error ? err.message : String(err);
          cacheMermaidRender(source, { error: nextError });
          setError(nextError);
          onRenderSettledRef.current?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

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
        width: svg ? 'fit-content' : 'min(100%, 680px)',
        maxWidth: '100%',
        boxSizing: 'border-box',
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
            width: svgSize
              ? `min(${Math.ceil(svgSize.width)}px, 680px, ${Math.ceil(widthLimitByHeight)}px)`
              : 'fit-content',
            aspectRatio: `${svgRatio} / 1`,
            minWidth: 0,
            display: 'grid',
            placeItems: 'center',
            cursor: onOpenFullscreen ? 'zoom-in' : 'default',
            '& svg': {
              width: '100% !important',
              height: '100% !important',
              maxWidth: '100%',
              maxHeight: '100%',
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
