import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { AssistantArtifactVersion, AssistantHtmlRuntimeManifest } from '../../types/assistantArtifact';
import { buildAssistantHtmlDocument } from './assistantHtmlDocument';
import { parseAssistantHtmlBridgeEvent } from './assistantHtmlBridge';
import { validateAssistantHtmlPayload } from './assistantHtmlValidation';

export interface AssistantHtmlInteractionPayload {
  artifactId: string;
  baseVersionId: string;
  interactionId: string;
  resultType: 'form' | 'quiz' | 'selection' | 'custom';
  payload: Record<string, unknown>;
}

export default function AssistantHtmlFrame({
  artifactId,
  version,
  manifest,
  inline = false,
  readOnly = false,
  onAutosave,
  onSubmit,
  onOpenFullscreen,
}: {
  artifactId: string;
  version: AssistantArtifactVersion;
  manifest: AssistantHtmlRuntimeManifest;
  inline?: boolean;
  readOnly?: boolean;
  onAutosave?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onSubmit?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onOpenFullscreen?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const channelToken = useMemo(() => `html-${crypto.randomUUID()}`, [artifactId, version.id]);
  const [height, setHeight] = useState(manifest.viewport?.preferredHeight || (inline ? 280 : 720));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
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
  }), [artifactId, channelToken, manifest, readOnly, version]);

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
        if (message.type === 'submit') void onSubmit?.(input);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '提交内容无效');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [artifactId, baseVersionId, channelToken, inline, interactionId, manifest, onAutosave, onOpenFullscreen, onSubmit, readOnly, version.id]);

  return (
    <Box sx={{ position: 'relative', width: '100%', minHeight: inline ? 160 : 'calc(100dvh - 110px)' }}>
      {!ready ? <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><CircularProgress size={20} /></Box> : null}
      <Box
        ref={frameRef}
        component="iframe"
        title="HTML 交互内容"
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        sx={{ width: '100%', height: inline ? height : 'calc(100dvh - 110px)', minHeight: inline ? 160 : 420, border: 0, display: 'block', bgcolor: '#fff' }}
      />
      {error ? <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography> : null}
    </Box>
  );
}
