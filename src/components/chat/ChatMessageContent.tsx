import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Button, Chip, IconButton, LinearProgress, Tooltip, Typography, keyframes } from '@mui/material';
import type { Message, MessageAttachment, NarrativeBlock } from '../../types/message';
import type { AICharacter } from '../../types/character';
import { getAttachmentStatusDetail, getAttachmentStatusLabel } from '../../services/messageAttachmentDisplay';
import { buildImageAttachmentHoverInfo } from '../../services/messageAttachmentHoverInfo';
import { getRichMediaQueueSnapshot, subscribeRichMediaQueue, type RichMediaQueueSnapshotEntry } from '../../services/richMessageMedia';
import MarkdownText from '../common/MarkdownText';
import { formatNarrativeLineText } from '../../services/narrativeLinePresentation';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { reducedMotionSx } from '../../styles/motion';

const typingBounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
`;

const INLINE_ATTACHMENT_PATTERN = /!\[([^\]\n]*)\]\(attachment:(?:\/\/)?([^)]+)\)/g;

type InlineAttachmentPart =
  | { kind: 'text'; text: string }
  | { kind: 'attachment'; slotId: string; altText: string };

function safeDecodeInlineSlotId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseInlineAttachmentPlaceholders(text: string): InlineAttachmentPart[] {
  const parts: InlineAttachmentPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_ATTACHMENT_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, start) });
    }
    const rawSlotId = (match[2] || '').trim();
    const slotId = rawSlotId ? safeDecodeInlineSlotId(rawSlotId).replace(/[^\w.-]/g, '') : '';
    if (slotId) {
      parts.push({ kind: 'attachment', slotId, altText: (match[1] || '').trim() });
    }
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return parts.length ? parts : [{ kind: 'text', text }];
}

export function PendingTypingDots() {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, py: 0.25 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'text.disabled',
            animation: `${typingBounce} 1.4s ease-in-out infinite`,
            animationDelay: `${i * 0.18}s`,
            ...reducedMotionSx,
          }}
        />
      ))}
    </Box>
  );
}

function parseAttachmentRatio(attachment: Pick<MessageAttachment, 'width' | 'height' | 'aspectRatio'>) {
  const width = Number(attachment.width || 0);
  const height = Number(attachment.height || 0);
  if (width > 0 && height > 0) return width / height;
  const ratioMatch = attachment.aspectRatio?.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const left = Number(ratioMatch[1]);
    const right = Number(ratioMatch[2]);
    if (left > 0 && right > 0) return left / right;
  }
  return 4 / 3;
}

export function buildAttachmentQueueProgress(
  message: Message,
  attachment: MessageAttachment,
  queueSnapshot: RichMediaQueueSnapshotEntry[] = [],
) {
  const entry = queueSnapshot.find((item) => item.messageId === message.id && item.attachmentId === attachment.id);
  if (!entry) return '';
  if (entry.status === 'queued') return `聊天图片队列 ${entry.position}/${entry.total}`;
  if (entry.status === 'generating') return `聊天图片生成中 ${entry.position}/${entry.total}`;
  return '';
}

function getAttachmentMaxWidth(ratio: number) {
  if (ratio < 0.82) return 300;
  if (ratio < 1.2) return 360;
  if (ratio < 1.7) return 440;
  return 520;
}

export function getAttachmentDisplayWidth(params: {
  displaySize?: { width: number; height: number } | null;
  ratioValue: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const widthLimitByHeight = Math.max(180, params.maxHeight * params.ratioValue);
  return Math.ceil(Math.min(params.displaySize?.width || params.maxWidth, params.maxWidth, widthLimitByHeight));
}

function getAttachmentKnownSize(attachment: Pick<MessageAttachment, 'width' | 'height'>) {
  const width = Number(attachment.width || 0);
  const height = Number(attachment.height || 0);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function formatAudioDuration(durationMs?: number) {
  const seconds = Math.max(1, Math.round((durationMs || 0) / 1000));
  return `${seconds}"`;
}

function estimateAudioDurationMs(attachment: MessageAttachment) {
  if (attachment.durationMs && attachment.durationMs > 0) return attachment.durationMs;
  const textLength = (attachment.promptText || attachment.altText || '').replace(/\s/g, '').length;
  return Math.max(1_500, Math.min(60_000, Math.round((textLength / 4.5) * 1_000)));
}

function MessageAudioAttachment({ attachment, showTranscript }: { attachment: MessageAttachment; showTranscript: boolean }) {
  const voiceWaveformStyle = useSettingsStore((state) => state.chatAppearance.voiceWaveformStyle || 'wave');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(attachment.durationMs || 0);
  const effectiveDurationMs = durationMs || estimateAudioDurationMs(attachment);
  const bubbleWidth = Math.round(Math.min(320, Math.max(142, 118 + (effectiveDurationMs / 1000) * 9)));
  const previewBars = Array.from({ length: 18 }, (_, index) => 26 + ((index * 17 + attachment.id.length * 7) % 68));
  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play(); else audio.pause();
  };
  return (
    <Box sx={{ display: 'grid', gap: 0.55, width: bubbleWidth, maxWidth: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.45, minHeight: 42, px: 0.55, pr: 1.15, borderRadius: 999, bgcolor: 'rgba(255, 112, 67, 0.11)', border: '1px solid rgba(255, 112, 67, 0.22)' }}>
        <audio
          ref={audioRef}
          src={attachment.url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            if (Number.isFinite(seconds) && seconds > 0) setDurationMs(Math.round(seconds * 1000));
          }}
          style={{ display: 'none' }}
        />
        <IconButton size="small" aria-label={playing ? '暂停语音' : '播放语音'} onClick={() => void toggle()} sx={{ color: 'primary.main' }}>
          <span style={{ fontSize: 17, lineHeight: 1 }}>{playing ? 'Ⅱ' : '▶'}</span>
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, flex: 1, minWidth: 0, height: 28, color: 'primary.main' }} aria-hidden="true">
          {voiceWaveformStyle === 'blocks' || voiceWaveformStyle === 'pulse' || voiceWaveformStyle === 'spectrum' ? previewBars.map((height, index) => (
            <Box key={index} sx={{ flex: 1, minWidth: 2, height: `${Math.max(22, height)}%`, borderRadius: 99, bgcolor: voiceWaveformStyle === 'spectrum' ? 'secondary.main' : 'currentColor', opacity: voiceWaveformStyle === 'spectrum' ? 0.42 + (index % 4) * 0.13 : 0.55, animation: voiceWaveformStyle === 'pulse' && playing ? `${typingBounce} 0.75s ease-in-out infinite` : undefined, animationDelay: `${index * 0.06}s` }} />
          )) : voiceWaveformStyle === 'orbit' ? previewBars.filter((_, index) => index % 2 === 0).map((height, index) => (
            <Box key={index} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: index % 2 ? 'secondary.main' : 'currentColor', opacity: 0.62, transform: `translateY(${(height - 50) / 9}px)`, animation: playing ? `${typingBounce} 0.9s ease-in-out infinite` : undefined, animationDelay: `${index * 0.08}s` }} />
          )) : (
            <svg viewBox="0 0 180 28" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <defs><linearGradient id={`formal-voice-${attachment.id}`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="currentColor" /><stop offset="1" stopColor="var(--mui-palette-secondary-main)" /></linearGradient></defs>
              <path d="M1 18 C14 18 16 7 28 10 S44 22 58 15 S76 5 90 11 S110 22 124 14 S146 7 179 12" fill="none" stroke={voiceWaveformStyle === 'ribbon' ? `url(#formal-voice-${attachment.id})` : 'currentColor'} strokeWidth={voiceWaveformStyle === 'ribbon' ? 3 : voiceWaveformStyle === 'neon' ? 2.4 : 2} strokeLinecap="round" style={voiceWaveformStyle === 'neon' ? { filter: 'drop-shadow(0 0 4px currentColor)' } : undefined} />
            </svg>
          )}
        </Box>
        <Typography variant="caption" sx={{ flexShrink: 0, fontWeight: 700, color: 'text.secondary' }}>{formatAudioDuration(effectiveDurationMs)}</Typography>
      </Box>
      {showTranscript && attachment.promptText ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.secondary' }}>
          {attachment.promptText}
        </Typography>
      ) : null}
    </Box>
  );
}

function MessageImageAttachment({
  message,
  attachment,
  onOpenImage,
  caption,
}: {
  message: Message;
  attachment: MessageAttachment;
  onOpenImage?: (message: Message, attachment: MessageAttachment) => void;
  caption?: string;
}) {
  const knownSize = getAttachmentKnownSize(attachment);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(knownSize);
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  const displaySize = naturalSize || knownSize;
  const ratioValue = displaySize ? displaySize.width / displaySize.height : parseAttachmentRatio(attachment);
  const maxWidth = getAttachmentMaxWidth(ratioValue);
  const maxHeight = Math.min(viewportHeight * 0.56, 520);
  const width = getAttachmentDisplayWidth({ displaySize, ratioValue, maxWidth, maxHeight });
  const hoverInfo = buildImageAttachmentHoverInfo(attachment, caption);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 0.45,
        width,
        maxWidth: '100%',
        justifySelf: 'start',
      }}
    >
      <Tooltip
        title={hoverInfo ? <Box sx={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>{hoverInfo}</Box> : ''}
        arrow
        enterDelay={450}
        disableHoverListener={!hoverInfo}
      >
        <Box
          sx={{
            borderRadius: 1.5,
            overflow: 'hidden',
            bgcolor: 'action.hover',
          }}
        >
          <Box
            component="img"
            src={attachment.url}
            alt={attachment.altText}
            loading="lazy"
            decoding="async"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
              }
            }}
            onClick={() => onOpenImage?.(message, attachment)}
            sx={{
              width: '100%',
              height: 'auto',
              maxHeight: 'min(56vh, 520px)',
              objectFit: 'contain',
              display: 'block',
              cursor: onOpenImage ? 'zoom-in' : 'default',
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'action.hover',
            }}
          />
        </Box>
      </Tooltip>
      {caption ? (
        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {caption}
        </Typography>
      ) : null}
    </Box>
  );
}

function NarrativeChoiceCard({ block, showDeveloperDetails = false }: { block: NarrativeBlock; showDeveloperDetails?: boolean }) {
  const chatAppearance = useSettingsStore((state) => state.chatAppearance);
  const maxContentWidth = chatAppearance.maxContentWidthUnlimited ? '100%' : chatAppearance.maxContentWidth;
  const choice = block.choices?.[0];
  const meta = showDeveloperDetails ? [
    choice?.intent ? `意图：${choice.intent}` : '',
    choice?.risk ? `风险：${choice.risk}` : '',
    choice?.reward ? `收益：${choice.reward}` : '',
  ].filter(Boolean) : [];
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <Box
        sx={(theme) => ({
          width: '100%',
          maxWidth: maxContentWidth,
          borderRadius: 2,
          px: { xs: 1.35, sm: 1.6 },
          py: { xs: 1, sm: 1.15 },
          border: '1px solid',
          borderColor: theme.palette.mode === 'light' ? 'rgba(99,102,241,0.22)' : 'rgba(129,140,248,0.32)',
          bgcolor: theme.palette.mode === 'light' ? 'rgba(238,242,255,0.62)' : 'rgba(49,46,129,0.20)',
        })}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, mb: 0.35 }}>
          你选择了
        </Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.75, fontWeight: 700, wordBreak: 'break-word' }}>
          {block.text}
        </Typography>
        {meta.length ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.55, lineHeight: 1.6, wordBreak: 'break-word' }}>
            {meta.join(' · ')}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

function NarrativeSystemPanel({ block, characters }: { block: NarrativeBlock; characters: AICharacter[] }) {
  const chatAppearance = useSettingsStore((state) => state.chatAppearance);
  const maxContentWidth = chatAppearance.maxContentWidthUnlimited ? '100%' : chatAppearance.maxContentWidth;
  const lines = block.text.split('\n').map((line) => line.trim()).filter(Boolean);
  const title = lines[0] || '章节回顾';
  const bodyLines = lines.slice(1);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <Box
        sx={(theme) => ({
          width: '100%',
          maxWidth: maxContentWidth,
          borderRadius: 2,
          px: { xs: 1.35, sm: 1.6 },
          py: { xs: 1, sm: 1.15 },
          border: '1px solid',
          borderColor: theme.palette.mode === 'light' ? 'rgba(14,165,233,0.24)' : 'rgba(125,211,252,0.26)',
          bgcolor: theme.palette.mode === 'light' ? 'rgba(240,249,255,0.72)' : 'rgba(8,47,73,0.26)',
          boxShadow: theme.palette.mode === 'light' ? '0 10px 28px rgba(15,23,42,0.06)' : '0 12px 30px rgba(0,0,0,0.22)',
        })}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, mb: 0.45 }}>
          {formatNarrativeLineText(title, characters)}
        </Typography>
        {bodyLines.map((line) => (
          <Typography key={line} component="div" variant="body2" sx={{ lineHeight: 1.75, wordBreak: 'break-word', mt: 0.35 }}>
            <MarkdownText text={formatNarrativeLineText(line, characters)} />
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export function NarrativeParagraphContent({ blocks, characters = [], showDeveloperDetails = false }: { blocks: NarrativeBlock[]; characters?: AICharacter[]; showDeveloperDetails?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.75 }}>
      {blocks.filter((block) => block.displayMode !== 'bubble').map((block) => {
        return block.displayMode === 'choice_card' ? (
        <NarrativeChoiceCard key={block.id} block={block} showDeveloperDetails={showDeveloperDetails} />
      ) : block.displayMode === 'system_panel' ? (
        showDeveloperDetails ? <NarrativeSystemPanel key={block.id} block={block} characters={characters} /> : null
      ) : (
        <Box key={block.id} sx={{ fontSize: 'inherit', lineHeight: 'inherit', color: 'text.primary', wordBreak: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
          <MarkdownText text={block.text} />
        </Box>
      );
      })}
    </Box>
  );
}

export function MessageContent({ message, onRetryMedia, onOpenImage, onOpenDiagram, compactMediaLayout = false }: {
  message: Message;
  onRetryMedia?: (message: Message, attachmentId: string) => void | Promise<void>;
  onOpenImage?: (message: Message, attachment: MessageAttachment) => void;
  onOpenDiagram?: (message: Message, diagram: { source: string; svg: string; dataUrl: string }) => void;
  compactMediaLayout?: boolean;
}) {
  const showVoiceTranscript = useSettingsStore((state) => state.showVoiceTranscript);
  const richMediaQueueSnapshot = useSyncExternalStore(
    subscribeRichMediaQueue,
    getRichMediaQueueSnapshot,
    getRichMediaQueueSnapshot,
  );
  const attachments = message.metadata?.attachments || [];
  const shouldHideMediaPlaceholderText = shouldHideGeneratedMediaPlaceholderText(message);
  const isAttachmentProcessing = (status: string | undefined) => status === 'queued' || status === 'generating' || status === 'placeholder';
  const statusChipColor = (status: string | undefined): 'error' | 'success' | 'primary' => {
    if (status === 'failed') return 'error';
    if (status === 'ready') return 'success';
    return 'primary';
  };
  const getMediaFrameStyle = (attachment: Pick<MessageAttachment, 'width' | 'height' | 'aspectRatio'>) => {
    const knownSize = getAttachmentKnownSize(attachment);
    const ratioValue = parseAttachmentRatio(attachment);
    const ratio = `${ratioValue} / 1`;
    const maxWidth = getAttachmentMaxWidth(ratioValue);
    const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
    const maxHeight = Math.min(viewportHeight * 0.56, 520);
    const width = getAttachmentDisplayWidth({ displaySize: knownSize, ratioValue, maxWidth, maxHeight });
    return {
      width,
      maxWidth: '100%',
      maxHeight: 'min(56vh, 520px)',
      justifySelf: 'start',
      aspectRatio: ratio,
      borderRadius: 1.5,
      border: '1px solid',
      borderColor: 'divider',
      overflow: 'hidden',
      bgcolor: 'action.hover',
      position: 'relative' as const,
    };
  };
  const findAttachmentBySlotId = (slotId: string) => attachments.find((attachment) => attachment.slotId === slotId || attachment.id === slotId);
  const visibleContentParts = shouldHideMediaPlaceholderText ? [] : parseInlineAttachmentPlaceholders(message.content);
  const hasInlineAttachments = visibleContentParts.some((part) => part.kind === 'attachment');
  const usedAttachmentIds = new Set<string>();
  const renderAttachment = (attachment: MessageAttachment, captionOverride?: string) => {
    if (attachment.kind === 'image') {
      const canRetryAttachment = attachment.status === 'failed' || attachment.status === 'queued' || attachment.status === 'generating' || (attachment.status === 'ready' && !attachment.url);
      if (attachment.status === 'ready' && attachment.url) {
        return (
          <MessageImageAttachment
            key={attachment.id}
            message={message}
            attachment={attachment}
            caption={captionOverride || attachment.caption}
            onOpenImage={onOpenImage}
          />
        );
      }
      return (
        <Box key={attachment.id} sx={getMediaFrameStyle(attachment)}>
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 1.5, textAlign: 'center' }}>
            <Box sx={{ display: 'grid', gap: 0.75, maxWidth: '85%' }}>
              <Box>
                <Chip size="small" label={getAttachmentStatusLabel(attachment)} color={statusChipColor(attachment.status)} variant="outlined" sx={{ height: 22 }} />
              </Box>
              {buildAttachmentQueueProgress(message, attachment, richMediaQueueSnapshot) ? (
                <Typography variant="caption" color="text.secondary">
                  {buildAttachmentQueueProgress(message, attachment, richMediaQueueSnapshot)}
                </Typography>
              ) : null}
              {isAttachmentProcessing(attachment.status) ? <LinearProgress /> : null}
              <Typography variant="caption" sx={{ color: attachment.status === 'failed' ? 'error.main' : 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {getAttachmentStatusDetail(attachment)}
              </Typography>
              {canRetryAttachment && onRetryMedia ? (
                <Button size="small" variant="outlined" color={attachment.status === 'failed' ? 'error' : 'primary'} onClick={() => void onRetryMedia?.(message, attachment.id)}>
                  重试
                </Button>
              ) : null}
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {captionOverride || attachment.caption || attachment.altText}
              </Typography>
            </Box>
          </Box>
        </Box>
      );
    }
    if (attachment.kind === 'audio') {
      if (attachment.status === 'ready' && attachment.url) {
        return <MessageAudioAttachment key={attachment.id} attachment={attachment} showTranscript={showVoiceTranscript} />;
      }
      const estimatedDurationMs = estimateAudioDurationMs(attachment);
      const loadingWidth = Math.round(Math.min(300, Math.max(142, 118 + (estimatedDurationMs / 1000) * 9)));
      return (
        <Box key={attachment.id} sx={{ width: loadingWidth, maxWidth: '100%', borderRadius: 999, border: '1px solid', borderColor: 'divider', px: 1.25, py: 0.75, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">{getAttachmentStatusLabel(attachment)}</Typography>
            <Chip size="small" label={attachment.status === 'failed' ? '失败' : '处理中'} color={statusChipColor(attachment.status)} variant="outlined" sx={{ height: 20 }} />
          </Box>
          {attachment.status !== 'failed' ? <LinearProgress sx={{ mt: 0.5 }} /> : null}
          <Typography variant="caption" sx={{ display: 'block', mt: 0.45, color: attachment.status === 'failed' ? 'error.main' : 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {getAttachmentStatusDetail(attachment)}
          </Typography>
          {attachment.status === 'failed' && onRetryMedia ? (
            <Button size="small" variant="outlined" color="error" sx={{ mt: 0.6 }} onClick={() => void onRetryMedia?.(message, attachment.id)}>
              重试
            </Button>
          ) : null}
        </Box>
      );
    }
    return null;
  };
  return (
    <Box sx={{ display: 'grid', gap: 0.9, width: compactMediaLayout ? 'fit-content' : 'auto', maxWidth: '100%' }}>
      {visibleContentParts.map((part, index) => {
        if (part.kind === 'text') {
          if (!part.text.trim()) return null;
          return (
            <Box key={`text-${index}`} sx={{ typography: 'body2', wordBreak: 'break-word', userSelect: 'text', WebkitUserSelect: 'text', '& table': { width: '100%', borderCollapse: 'collapse' }, '& th, & td': { border: '1px solid', borderColor: 'divider', px: 0.75, py: 0.4 } }}>
              <MarkdownText
                text={part.text}
                forceRich={message.metadata?.format === 'markdown'}
                deferDiagrams={Boolean(message.isStreaming)}
                onOpenDiagram={onOpenDiagram ? (diagram) => onOpenDiagram(message, diagram) : undefined}
              />
            </Box>
          );
        }
        const attachment = findAttachmentBySlotId(part.slotId);
        if (!attachment) {
          return (
            <Box key={`missing-attachment-${part.slotId}-${index}`} sx={{ borderRadius: 1.5, border: '1px dashed', borderColor: 'divider', px: 1.25, py: 1, color: 'text.secondary' }}>
              <Typography variant="caption">{part.altText || '图片'}暂不可用</Typography>
            </Box>
          );
        }
        usedAttachmentIds.add(attachment.id);
        return renderAttachment(attachment, part.altText || attachment.caption);
      })}
      {attachments
        .filter((attachment) => !hasInlineAttachments || !usedAttachmentIds.has(attachment.id))
        .map((attachment) => renderAttachment(attachment))}
    </Box>
  );
}

export function shouldHideGeneratedMediaPlaceholderText(message: Pick<Message, 'content' | 'metadata'>) {
  const attachments = message.metadata?.attachments || [];
  const hasMediaAttachments = attachments.some((attachment) => attachment.kind === 'image' || attachment.kind === 'audio');
  if (!hasMediaAttachments) return false;
  return [
    '正在生成图片，完成后会自动显示。',
    '正在生成图片，完成后会自动显示',
  ].includes(message.content.trim());
}
