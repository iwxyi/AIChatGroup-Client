import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { AssistantArtifactVersion, AssistantHtmlRuntimeManifest } from '../../types/assistantArtifact';
import { buildAssistantHtmlDocument } from './assistantHtmlDocument';
import { parseAssistantHtmlBridgeEvent } from './assistantHtmlBridge';
import { validateAssistantHtmlPayload } from './assistantHtmlValidation';
import { useTheme } from '@mui/material/styles';
import { logDeveloperDiagnostic } from '../../services/developerDiagnostics';

export interface AssistantHtmlInteractionPayload {
  artifactId: string;
  baseVersionId: string;
  interactionId: string;
  resultType: 'form' | 'quiz' | 'selection' | 'custom';
  payload: Record<string, unknown>;
}

function createHtmlChannelToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `html-${crypto.randomUUID()}`;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return `html-${Array.from(bytes, (value) => value.toString(36)).join('')}`;
  }
  return `html-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export default function AssistantHtmlFrame({
  artifactId,
  version,
  manifest,
  inline = false,
  fillContainer = false,
  interactive = true,
  readOnly = false,
  onAutosave,
  onSubmit,
  onOpenFullscreen,
}: {
  artifactId: string;
  version: AssistantArtifactVersion;
  manifest: AssistantHtmlRuntimeManifest;
  inline?: boolean;
  fillContainer?: boolean;
  interactive?: boolean;
  readOnly?: boolean;
  onAutosave?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onSubmit?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onOpenFullscreen?: () => void;
}) {
  const theme = useTheme();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const channelToken = useMemo(createHtmlChannelToken, [artifactId, version.id]);
  const [height, setHeight] = useState(manifest.viewport?.preferredHeight || (inline ? 280 : 720));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const interactionId = manifest.submission?.interactionId || '';
  const baseVersionId = version.stage === 'autosave' && version.baseVersionId ? version.baseVersionId : version.id;
  const srcDoc = useMemo(() => buildAssistantHtmlDocument({
    html: version.content,
    manifest,
    channelToken,
    artifactId,
    versionId: version.id,
    interactionState: version.interactionState,
    readOnly,
    displayMode: theme.palette.mode,
  }), [artifactId, channelToken, manifest, readOnly, theme.palette.mode, version]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = parseAssistantHtmlBridgeEvent({
        event,
        frameWindow: frameRef.current?.contentWindow || null,
        channelToken,
        artifactId,
        versionId: version.id,
        interactionId,
      });
      if (!message) return;
      if (message.type === 'ready' || message.type === 'resize') {
        setReady(true);
        const nextHeight = Number(message.height || 0);
        if (Number.isFinite(nextHeight) && nextHeight > 0) {
          const maxHeight = inline ? manifest.viewport?.maxInlineHeight || 480 : 1600;
          setHeight(Math.min(Math.max(nextHeight, 160), maxHeight));
        }
        return;
      }
      if (message.type === 'error') {
        logDeveloperDiagnostic('html-artifact:iframe-error', { artifactId, error: message.error || 'unknown' }, 'error', 'chat-window');
        setError(String(message.error || 'HTML 交互脚本执行失败'));
        return;
      }
      if (message.type === 'open_fullscreen') {
        onOpenFullscreen?.();
        return;
      }
      if (readOnly || !message.payload || !manifest.submission) return;
      try {
        const payload = validateAssistantHtmlPayload(manifest, message.payload);
        const input: AssistantHtmlInteractionPayload = {
          artifactId,
          baseVersionId,
          interactionId,
          resultType: manifest.submission.resultType,
          payload,
        };
        setError('');
        if (message.type === 'autosave') void onAutosave?.(input);
        if (message.type === 'submit') {
          setSubmitting(true);
          void Promise.resolve(onSubmit?.(input)).catch((reason) => {
            setError(reason instanceof Error ? reason.message : '提交失败');
          }).finally(() => setSubmitting(false));
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '提交内容无效');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [artifactId, baseVersionId, channelToken, inline, interactionId, manifest, onAutosave, onOpenFullscreen, onSubmit, readOnly, version.id]);

  useEffect(() => {
    setReady(false);
    setError('');
  }, [srcDoc]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: fillContainer ? '100%' : 'auto', minHeight: fillContainer ? 0 : inline ? 160 : 'calc(100dvh - 110px)', flex: fillContainer ? 1 : undefined }}>
      {!ready ? <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><CircularProgress size={20} /></Box> : null}
      {submitting ? (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(15,18,24,0.42)', backdropFilter: 'blur(2px)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 1, bgcolor: 'background.paper', color: 'text.primary', boxShadow: 3 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">正在提交</Typography>
          </Box>
        </Box>
      ) : null}
      <Box
        ref={frameRef}
        component="iframe"
        title="HTML 交互内容"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-forms"
        onLoad={() => {
          logDeveloperDiagnostic('html-artifact:iframe-load', { artifactId, versionId: version.id }, 'info', 'chat-window');
          // A load event without a bridge-ready event means the document
          // rendered but its runtime script did not execute.
          window.setTimeout(() => {
            if (!frameRef.current?.contentWindow) return;
            setReady((current) => {
              if (!current) {
                logDeveloperDiagnostic('html-artifact:iframe-runtime-missing', { artifactId, versionId: version.id }, 'error', 'chat-window');
                setError('HTML 页面已加载，但交互脚本未执行');
              }
              return current;
            });
          }, 1200);
        }}
        sx={{ width: '100%', height: fillContainer ? '100%' : inline ? height : 'calc(100dvh - 110px)', minHeight: fillContainer ? 0 : inline ? 160 : 420, border: 0, display: 'block', pointerEvents: interactive ? 'auto' : 'none', bgcolor: theme.palette.mode === 'dark' ? '#181a20' : '#fff' }}
      />
      {!ready ? <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>正在加载交互内容…</Typography> : null}
      {error ? <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography> : null}
    </Box>
  );
}
