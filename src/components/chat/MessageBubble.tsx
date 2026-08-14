import { memo, useMemo, useRef, useState } from 'react';
import { Box, Typography, Avatar, Dialog, DialogContent, DialogTitle, DialogActions, Menu, MenuItem, Tooltip, Divider, Button, TextField, Stack, IconButton, ListItemIcon, CircularProgress } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import InsightsIcon from '@mui/icons-material/Insights';
import RateReviewIcon from '@mui/icons-material/RateReview';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Message, MessageAttachment } from '../../types/message';
import type { AICharacter } from '../../types/character';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { buildBubblePreview, resolveCharacterBubbleStyle } from '../../utils/bubbleStyle';
import { isImageAvatar } from '../../utils/avatar';
import { rememberFailedAvatarUrl, resolveSafeAvatarSrc } from '../../utils/avatarFallback';
import { formatTimestamp } from '../../utils/format';
import { MessageContent, NarrativeParagraphContent, PendingTypingDots } from './ChatMessageContent';
import DebugChip from '../common/DebugChip';
import AppSnackbar from '../common/AppSnackbar';
import { EXPRESSION_FEEDBACK_MENU_GROUPS, type ExpressionFeedbackKind } from '../../services/characterExpressionFeedback';
import { copyTextToClipboard } from '../../utils/clipboard';
import type { AssistantHtmlInteractionPayload } from '../../features/assistantHtml/AssistantHtmlFrame';
import { getNarrativeDisplayBlocks, hasNarrativeReaderBlocks, isNarrativeParagraphMessage, shouldUseCompactMediaBubble, shouldUseCompactMessageBubble } from './messageBubblePresentation';
import { DefaultUserAvatarIcon, TopicGuideAvatarIcon } from '../common/IdentityIcons';
import AssistantHtmlMessageBlock from '../../features/assistantHtml/AssistantHtmlMessageBlock';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { api } from '../../services/api';

interface MessageBubbleProps {
  message: Message;
  character?: AICharacter;
  characters?: AICharacter[];
  onDelete?: (id: string) => void;
  onAnalyze?: (message: Message) => void;
  onExpressionFeedback?: (message: Message, kind: ExpressionFeedbackKind) => void;
  onRetryMedia?: (message: Message, attachmentId: string) => void | Promise<void>;
  onOpenImage?: (message: Message, attachment: MessageAttachment) => void;
  onAddImagesToReference?: (message: Message, attachments: MessageAttachment[]) => void;
  onOpenDiagram?: (message: Message, diagram: { source: string; svg: string; dataUrl: string }) => void;
  onCharacterAvatarClick?: (character: AICharacter, anchorEl: HTMLElement) => void;
  pending?: boolean;
  currentUser?: { nickname?: string; avatar?: string };
  selfMemberId?: string | null;
  privateConversation?: boolean;
  branchVersionInfo?: { index: number; total: number; isActive: boolean } | null;
  onCreateRevision?: (message: Message, content: string) => void | Promise<void>;
  onSwitchRevision?: (message: Message, direction: -1 | 1) => void | Promise<void>;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenHtmlFullscreen?: (artifactId: string) => void;
  onHtmlAutosave?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
  onHtmlSubmit?: (input: AssistantHtmlInteractionPayload) => void | Promise<void>;
}

interface MenuPosition {
  mouseX: number;
  mouseY: number;
}

interface LongPressTouchState extends MenuPosition {
  scrollLeft: number;
  scrollTop: number;
  scrollElement: HTMLElement | Window;
  cancelled: boolean;
}

const LONG_PRESS_DELAY_MS = 600;
const LONG_PRESS_TAP_SLOP = 8;
const LONG_PRESS_SCROLL_INTENT_Y = 6;
const LONG_PRESS_SCROLL_RATIO = 1.15;
const LONG_PRESS_SCROLL_SLOP = 2;

function getScrollableAncestor(target: EventTarget | null): HTMLElement | Window {
  if (!(target instanceof HTMLElement)) return window;
  let element: HTMLElement | null = target;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) {
      return element;
    }
    element = element.parentElement;
  }
  return window;
}

function getScrollSnapshot(element: HTMLElement | Window) {
  if (element instanceof Window) {
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY,
    };
  }
  return {
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
  };
}

function buildWithdrawalDebugTitle(withdrawal: NonNullable<Message['metadata']>['withdrawal'] | null) {
  if (!withdrawal?.originalContent) return '';
  return (
    <Box sx={{ maxWidth: 360 }}>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>撤回原文</Typography>
      <Typography variant="caption" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {withdrawal.originalContent}
      </Typography>
      {withdrawal.reason ? (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, opacity: 0.78, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {withdrawal.reason}
        </Typography>
      ) : null}
    </Box>
  );
}

function MessageBubble({ message, character, characters = [], onDelete, onAnalyze, onExpressionFeedback, onRetryMedia, onOpenImage, onAddImagesToReference, onOpenDiagram, onCharacterAvatarClick, pending = false, currentUser, selfMemberId = null, privateConversation = false, branchVersionInfo, onCreateRevision, onSwitchRevision, onOpenArtifact, onOpenHtmlFullscreen, onHtmlAutosave, onHtmlSubmit }: MessageBubbleProps) {
  const customBubbleStyles = useSettingsStore((state) => state.customBubbleStyles);
  const userBubbleStyleId = useSettingsStore((state) => state.userBubbleStyleId);
  const userBubbleStyle = useSettingsStore((state) => state.userBubbleStyle);
  const compactBubbleMode = useSettingsStore((state) => state.compactBubbleMode);
  const compactPrivateBubbleMode = useSettingsStore((state) => state.compactPrivateBubbleMode);
  const chatAppearance = useSettingsStore((state) => state.chatAppearance);
  const developerMode = useSettingsStore((state) => state.developerMode);
  const showWithdrawnMessageContent = useSettingsStore((state) => state.developerUI.showWithdrawnMessageContent);
  const navigate = useNavigate();
  const location = useLocation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const canPlayVoice = Boolean(message.type === 'ai' && !pending && message.content.trim() && character?.voiceConfig?.enabled !== false);
  const toggleVoice = async () => {
    if (!canPlayVoice) return;
    if (!voiceUrl) {
      setVoiceGenerating(true);
      try {
        const result = await api.synthesizeSpeech({
          text: message.content,
          voice: character?.voiceConfig?.voiceName,
          style: character?.voiceConfig?.style || character?.voiceConfig?.instructions,
          emotion: character?.voiceConfig?.emotion,
          speed: character?.voiceConfig?.rate ? Number.parseFloat(character.voiceConfig.rate) || undefined : undefined,
          pitch: character?.voiceConfig?.pitch ? Number.parseFloat(character.voiceConfig.pitch) || undefined : undefined,
          chatId: message.chatId,
          messageId: message.serverId || message.id,
          attachmentId: `voice-${message.id}`,
        });
        setVoiceUrl(result.asset?.url || result.audioDataUrl);
      } finally {
        setVoiceGenerating(false);
      }
      return;
    }
    const audio = voiceAudioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play(); else audio.pause();
  };
  const voiceBar = voiceUrl ? (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, width: 'min(280px, 100%)', px: 0.7, py: 0.35, borderRadius: 999, bgcolor: 'action.hover' }}>
      <audio
        ref={voiceAudioRef}
        src={voiceUrl}
        preload="metadata"
        onPlay={() => setVoicePlaying(true)}
        onPause={() => setVoicePlaying(false)}
        onEnded={() => { setVoicePlaying(false); setVoiceProgress(0); }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setVoiceProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        }}
        style={{ display: 'none' }}
      />
      <IconButton size="small" onClick={() => void toggleVoice()} aria-label={voicePlaying ? '暂停语音' : '播放语音'}>
        {voicePlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
      </IconButton>
      <Box sx={{ flex: 1, height: 5, borderRadius: 999, bgcolor: 'divider', overflow: 'hidden', cursor: 'pointer' }} onClick={(event) => {
        const audio = voiceAudioRef.current;
        if (!audio || !audio.duration) return;
        const rect = event.currentTarget.getBoundingClientRect();
        audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * audio.duration;
      }}>
        <Box sx={{ height: '100%', width: `${voiceProgress * 100}%`, bgcolor: 'primary.main', transition: 'width 120ms linear' }} />
      </Box>
      <VolumeUpIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
    </Box>
  ) : null;
  const [revisionEditorOpen, setRevisionEditorOpen] = useState(false);
  const [revisionDraft, setRevisionDraft] = useState(message.content);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<LongPressTouchState | null>(null);
  const canDelete = useMemo(() => !pending && message.type !== 'system' && Boolean(onDelete), [message.type, onDelete, pending]);
  const canFeedback = useMemo(() => !pending && message.type === 'ai' && Boolean(onExpressionFeedback), [message.type, onExpressionFeedback, pending]);
  const canEditRevision = Boolean(onCreateRevision) && !pending && message.type !== 'system' && message.type !== 'event';
  const readyImageAttachments = useMemo(() => (message.metadata?.attachments || [])
    .filter((attachment) => attachment.kind === 'image' && attachment.status === 'ready' && Boolean(attachment.url)), [message.metadata?.attachments]);
  const canAddImagesToReference = !pending && readyImageAttachments.length > 0 && Boolean(onAddImagesToReference);
  const artifactRefs = message.metadata?.assistant?.artifacts || [];
  const htmlArtifactRefs = artifactRefs.filter((artifact) => artifact.kind === 'html');
  const interactiveHtmlArtifactRefs = htmlArtifactRefs.filter((artifact) => artifact.presentation !== 'fullscreen_html');
  const previewHtmlArtifactRefs = htmlArtifactRefs.filter((artifact) => artifact.presentation === 'fullscreen_html');
  const nonHtmlArtifactRefs = artifactRefs.filter((artifact) => artifact.kind !== 'html');
  const visibleMessage = useMemo(() => {
    if (!htmlArtifactRefs.length) return message;
    const content = message.content
      .replace(/```(?:html|htm)\s*[\s\S]*?```/gi, '')
      .replace(/```\s*(?=(?:<!doctype\s+html\b|<html\b))[\s\S]*?```/gi, '')
      .replace(/<!doctype\s+html\b[\s\S]*$/gi, '')
      .replace(/<html\b[\s\S]*?<\/html\s*>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return content === message.content ? message : { ...message, content: content || `已创建「${htmlArtifactRefs[0]?.title || '交互内容'}」。` };
  }, [message]);

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const openMenuAt = (x: number, y: number) => {
    if (pending) return;
    setMenuPosition({ mouseX: x, mouseY: y });
  };

  const closeMenus = () => {
    setMenuPosition(null);
  };

  const cancelLongPress = () => {
    if (touchStartRef.current) touchStartRef.current.cancelled = true;
    clearPressTimer();
  };

  const handlePressStart = (x: number, y: number, target: EventTarget | null) => {
    clearPressTimer();
    const scrollElement = getScrollableAncestor(target);
    const scroll = getScrollSnapshot(scrollElement);
    touchStartRef.current = {
      mouseX: x,
      mouseY: y,
      scrollElement,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      cancelled: false,
    };
    pressTimerRef.current = setTimeout(() => {
      const start = touchStartRef.current;
      if (!start || start.cancelled) return;
      const nextScroll = getScrollSnapshot(start.scrollElement);
      const scrolled = Math.abs(nextScroll.scrollTop - start.scrollTop) > LONG_PRESS_SCROLL_SLOP
        || Math.abs(nextScroll.scrollLeft - start.scrollLeft) > LONG_PRESS_SCROLL_SLOP;
      if (scrolled) {
        touchStartRef.current = null;
        pressTimerRef.current = null;
        return;
      }
      openMenuAt(start.mouseX, start.mouseY);
      touchStartRef.current = null;
      pressTimerRef.current = null;
    }, LONG_PRESS_DELAY_MS);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    const start = touchStartRef.current;
    if (!touch || !start) return;
    const deltaX = touch.clientX - start.mouseX;
    const deltaY = touch.clientY - start.mouseY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const nextScroll = getScrollSnapshot(start.scrollElement);
    const scrolled = Math.abs(nextScroll.scrollTop - start.scrollTop) > LONG_PRESS_SCROLL_SLOP
      || Math.abs(nextScroll.scrollLeft - start.scrollLeft) > LONG_PRESS_SCROLL_SLOP;
    const verticalScrollIntent = absY > LONG_PRESS_SCROLL_INTENT_Y && absY > absX * LONG_PRESS_SCROLL_RATIO;
    if (scrolled || verticalScrollIntent || Math.hypot(deltaX, deltaY) > LONG_PRESS_TAP_SLOP) {
      cancelLongPress();
      touchStartRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    cancelLongPress();
    touchStartRef.current = null;
  };

  const handleCopy = async () => {
    const copied = await copyTextToClipboard(message.content);
    closeMenus();
    setCopyStatus(copied ? 'success' : 'error');
  };

  const handleDelete = () => {
    if (onDelete) onDelete(message.id);
    closeMenus();
  };

  const handleAnalyze = () => {
    if (onAnalyze) onAnalyze(message);
    closeMenus();
  };

  const handleAddImagesToReference = () => {
    if (onAddImagesToReference && readyImageAttachments.length) onAddImagesToReference(message, readyImageAttachments);
    closeMenus();
  };

  const openFeedbackDialog = () => {
    if (!canFeedback) return;
    closeMenus();
    setFeedbackDialogOpen(true);
  };

  const openRevisionEditor = () => {
    if (!canEditRevision) return;
    setRevisionDraft(message.content);
    setRevisionEditorOpen(true);
    closeMenus();
  };

  const closeRevisionEditor = () => setRevisionEditorOpen(false);

  const handleSaveRevision = () => {
    if (!onCreateRevision) return;
    const nextContent = revisionDraft.trim();
    if (!nextContent) return;
    void onCreateRevision(message, nextContent);
    setRevisionEditorOpen(false);
  };

  const handleExpressionFeedback = (kind: ExpressionFeedbackKind) => {
    if (onExpressionFeedback) onExpressionFeedback(message, kind);
    setFeedbackDialogOpen(false);
  };

  const handleAvatarClick = (event: React.MouseEvent<HTMLElement>) => {
    if (message.type === 'ai' && !pending) {
      if (onCharacterAvatarClick) {
        onCharacterAvatarClick(effectiveCharacter || ({
          id: message.senderId,
          name: message.senderName,
          avatar: '',
        } as AICharacter), event.currentTarget);
        return;
      }
      navigate(`/characters/${message.senderId}/edit?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
    }
  };

  const bubbleHandlers = pending
    ? {}
    : {
        onDoubleClick: () => setViewerOpen(true),
        onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
          e.preventDefault();
          openMenuAt(e.clientX, e.clientY);
        },
        onMouseDown: clearPressTimer,
        onMouseUp: clearPressTimer,
        onMouseLeave: clearPressTimer,
        onMouseMove: clearPressTimer,
        onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
          const touch = e.touches[0];
          if (touch) handlePressStart(touch.clientX, touch.clientY, e.target);
        },
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: handleTouchEnd,
      };

  if (message.isDeleted) return null;

  const manualSpeaker = message.metadata?.manualSpeaker;
  const isManualSpeaker = message.type === 'user' && Boolean(manualSpeaker);
  const isPerspectiveSelf = Boolean(selfMemberId && message.type === 'ai' && message.senderId === selfMemberId);
  const isUser = message.type === 'user' || message.type === 'god' || isPerspectiveSelf;
  const effectiveCharacter = message.type === 'ai' ? character : undefined;
  const resolvedStyle = effectiveCharacter
    ? resolveCharacterBubbleStyle({ bubbleStyle: effectiveCharacter.bubbleStyle, bubbleStyleId: effectiveCharacter.bubbleStyleId, customStyles: customBubbleStyles })
    : null;
  const resolvedUserStyle = isUser && userBubbleStyleId
    ? resolveCharacterBubbleStyle({ bubbleStyle: userBubbleStyle, bubbleStyleId: userBubbleStyleId, customStyles: customBubbleStyles })
    : null;
  const isGuidanceBubble = message.type === 'god';
  const useCompactBubble = shouldUseCompactMessageBubble({
    compactBubbleMode,
    compactPrivateBubbleMode,
    privateConversation,
    selfMemberId,
    isUser,
    isGuidanceBubble,
  });
  const bubblePreview = useCompactBubble
    ? { borderRadius: '18px', background: '#ffffff', color: '#111827', border: '1px solid rgba(15, 23, 42, 0.08)', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' }
    : (resolvedStyle ? buildBubblePreview(resolvedStyle, isUser) : (resolvedUserStyle ? buildBubblePreview(resolvedUserStyle, true) : null));
  const avatar = effectiveCharacter?.avatar;
  const wrapperJustify = isUser ? 'flex-end' : 'flex-start';
  const normalizedCurrentUserAvatar = currentUser?.avatar?.trim() === '🍵' ? '' : currentUser?.avatar?.trim();
  const selfAvatarValue = isGuidanceBubble ? '' : (isPerspectiveSelf ? effectiveCharacter?.avatar?.trim() : (isManualSpeaker ? manualSpeaker?.avatar?.trim() : normalizedCurrentUserAvatar));
  const selfAvatarText = isGuidanceBubble ? message.senderName : ((isPerspectiveSelf ? effectiveCharacter?.name : (isManualSpeaker ? manualSpeaker?.actorName : currentUser?.nickname))?.trim() || message.senderName);
  const selfAvatar = selfAvatarValue || selfAvatarText.slice(0, 1);
  const selfAvatarAlt = selfAvatarText || message.senderName;
  const useDefaultUserAvatar = !isGuidanceBubble && !isPerspectiveSelf && !isManualSpeaker && !selfAvatarValue;
  const withdrawal = message.metadata?.withdrawal;
  const isFinalWithdrawn = Boolean(withdrawal?.withdrawn && !withdrawal.visiblePending);
  const finalWithdrawal = isFinalWithdrawn ? withdrawal : null;
  const showWithdrawalDebug = developerMode && showWithdrawnMessageContent && Boolean(finalWithdrawal?.originalContent);
  const withdrawalNotice = message.content || `${message.senderName}撤回了一条消息`;
  const withdrawalNoticeNode = (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.25, minWidth: 0 }}>
      <Typography variant="body2" sx={{ color: isUser ? 'rgba(15, 23, 42, 0.72)' : 'text.secondary', fontStyle: 'italic', userSelect: 'text', WebkitUserSelect: 'text', minWidth: 0 }}>
        {withdrawalNotice}
      </Typography>
      {showWithdrawalDebug ? <DebugChip sx={{ height: 20, flexShrink: 0 }} /> : null}
    </Box>
  );
  const useNarrativeParagraph = !isFinalWithdrawn && (!pending || isNarrativeParagraphMessage(message));
  const narrativeParagraphBlocks = useNarrativeParagraph ? getNarrativeDisplayBlocks(message) : [];
  const contentMaxWidth = chatAppearance.maxContentWidthUnlimited ? '100%' : chatAppearance.maxContentWidth;
  const compactMediaBubble = !isFinalWithdrawn && shouldUseCompactMediaBubble(message);
  const shouldRenderNarrativeReader = hasNarrativeReaderBlocks(narrativeParagraphBlocks);
  if (shouldRenderNarrativeReader || (pending && useNarrativeParagraph)) {
    const narrativeCharacters = characters.length ? characters : effectiveCharacter ? [effectiveCharacter] : [];
    const storyReaderFontFamily = chatAppearance.storyReader.fontFamily === 'serif'
      ? 'Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif'
      : chatAppearance.storyReader.fontFamily === 'sans'
        ? 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        : undefined;
    return (
      <>
        <Box data-message-id={message.id} data-message-type={message.type} sx={{ display: 'flex', justifyContent: 'center', px: { xs: 2, sm: 3 }, py: 1.1, width: '100%' }}>
          <Box
            {...bubbleHandlers}
            sx={{
              width: '100%',
              maxWidth: contentMaxWidth,
              px: { xs: 0.5, sm: 1 },
              py: 0.5,
              fontFamily: storyReaderFontFamily,
              fontSize: chatAppearance.storyReader.fontSize,
              lineHeight: chatAppearance.storyReader.lineHeight,
              '& .MuiTypography-root': {
                fontSize: 'inherit',
                lineHeight: 'inherit',
              },
              '& .MuiBox-root': {
                fontSize: 'inherit',
                lineHeight: 'inherit',
              },
            }}
          >
            {narrativeParagraphBlocks.length ? <NarrativeParagraphContent blocks={narrativeParagraphBlocks} characters={narrativeCharacters} showDeveloperDetails={developerMode} /> : <PendingTypingDots />}
          </Box>
        </Box>
        <Dialog open={viewerOpen} onClose={() => setViewerOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{message.senderName}</DialogTitle>
          <DialogContent><NarrativeParagraphContent blocks={narrativeParagraphBlocks} characters={narrativeCharacters} /></DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box data-message-id={message.id} data-message-type={message.type} sx={{ display: 'flex', justifyContent: wrapperJustify, px: 2, py: 0.75, gap: 1.25, alignItems: 'flex-start' }}>
        {!isUser ? (
          <Box onClick={handleAvatarClick} sx={{ cursor: message.type === 'ai' && !pending ? 'pointer' : 'default', flexShrink: 0 }}>
            {avatar && isImageAvatar(avatar) ? (
              <Avatar src={resolveSafeAvatarSrc(avatar)} alt={message.senderName} slotProps={{ img: { loading: 'lazy', decoding: 'async', onError: () => rememberFailedAvatarUrl(avatar) } }} sx={{ width: 38, height: 38 }} />
            ) : (
              <Avatar sx={{ width: 38, height: 38, bgcolor: resolvedStyle?.backgroundColor || 'primary.main' }}>{message.senderName.slice(0, 1)}</Avatar>
            )}
          </Box>
        ) : null}

        <Box sx={{ maxWidth: contentMaxWidth, minWidth: 0, display: 'grid', gap: 0.35, justifyItems: isUser ? 'end' : 'start' }}>
          <Stack
            direction="row"
            spacing={0.5}
            title={formatTimestamp(message.timestamp)}
            sx={{ color: 'text.secondary', px: 0.5, width: 'fit-content', maxWidth: '100%', alignItems: 'center' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 500, textAlign: isUser ? 'right' : 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.senderName}
            </Typography>
            {branchVersionInfo && branchVersionInfo.total > 1 && onSwitchRevision ? (
              <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0, alignItems: 'center' }}>
                <Tooltip title="上一版" arrow>
                  <span>
                    <IconButton size="small" disabled={branchVersionInfo.index <= 1} onClick={() => onSwitchRevision(message, -1)} sx={{ width: 22, height: 22 }}>
                      <ChevronLeftIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {branchVersionInfo.index}/{branchVersionInfo.total}
                </Typography>
                <Tooltip title="下一版" arrow>
                  <span>
                    <IconButton size="small" disabled={branchVersionInfo.index >= branchVersionInfo.total} onClick={() => onSwitchRevision(message, 1)} sx={{ width: 22, height: 22 }}>
                      <ChevronRightIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            ) : null}
          </Stack>
          <Box
            {...bubbleHandlers}
            sx={{
              width: compactMediaBubble ? 'fit-content' : undefined,
              maxWidth: '100%',
              justifySelf: compactMediaBubble ? (isUser ? 'end' : 'start') : undefined,
              px: 1.4,
              py: 1,
              borderRadius: bubblePreview?.borderRadius || '18px',
              bgcolor: isUser && !bubblePreview ? 'primary.main' : undefined,
              background: bubblePreview?.background || (isUser ? undefined : '#ffffff'),
              color: bubblePreview?.color || (isUser ? 'primary.contrastText' : (resolvedStyle?.textColor || '#1f2937')),
              border: bubblePreview?.border || '1px solid rgba(15, 23, 42, 0.08)',
              boxShadow: bubblePreview?.boxShadow || '0 8px 24px rgba(15, 23, 42, 0.08)',
            }}
          >
            {pending && !message.content ? <PendingTypingDots /> : isFinalWithdrawn ? (
              showWithdrawalDebug ? (
                <Tooltip title={buildWithdrawalDebugTitle(finalWithdrawal)} arrow placement="top" enterTouchDelay={0}>
                  <Box sx={{ cursor: 'help', '&:hover .MuiTypography-root': { textDecoration: 'underline' } }}>
                    {withdrawalNoticeNode}
                  </Box>
                </Tooltip>
              ) : withdrawalNoticeNode
            ) : <MessageContent message={visibleMessage} onRetryMedia={onRetryMedia} onOpenImage={onOpenImage} onOpenDiagram={onOpenDiagram} compactMediaLayout={compactMediaBubble} />}
          </Box>
          {voiceBar}
          {nonHtmlArtifactRefs.length ? (
            <Box
              component="button"
              type="button"
              onClick={() => nonHtmlArtifactRefs[0]?.id && onOpenArtifact?.(nonHtmlArtifactRefs[0].id)}
              sx={(theme) => ({
                display: 'inline-block',
                width: 'fit-content',
                maxWidth: '100%',
                border: 'none',
                borderRadius: 1,
                px: 1,
                py: 0.35,
                ml: isUser ? 0 : 0.5,
                mr: isUser ? 0.5 : 0,
                bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.48)' : 'rgba(15,23,42,0.34)',
                color: 'text.secondary',
                boxShadow: 'none',
                backdropFilter: 'blur(16px) saturate(1.08)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.08)',
                cursor: onOpenArtifact ? 'pointer' : 'default',
                font: 'inherit',
                textAlign: 'left',
                justifySelf: isUser ? 'end' : 'start',
                lineHeight: 1.25,
                '&:hover': onOpenArtifact ? {
                  color: 'text.primary',
                  bgcolor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.46)',
                } : undefined,
              })}
            >
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
                产物详情{nonHtmlArtifactRefs.length > 1 ? ` · ${nonHtmlArtifactRefs.length}` : ''}
              </Typography>
            </Box>
          ) : null}
          {previewHtmlArtifactRefs.map((artifact) => (
            <AssistantHtmlMessageBlock key={`${artifact.id}:${artifact.versionId || 'current'}`} artifactRef={artifact} onOpenFullscreen={onOpenHtmlFullscreen} />
          ))}
        </Box>

        {isUser ? (
          <Box sx={{ flexShrink: 0 }}>
            {selfAvatarValue && isImageAvatar(selfAvatarValue) ? (
              <Avatar src={resolveSafeAvatarSrc(selfAvatarValue)} alt={selfAvatarAlt} slotProps={{ img: { loading: 'lazy', decoding: 'async', onError: () => rememberFailedAvatarUrl(selfAvatarValue) } }} sx={{ width: 38, height: 38 }} />
            ) : (
              <Avatar sx={{ width: 38, height: 38, bgcolor: isGuidanceBubble || useDefaultUserAvatar ? 'transparent' : 'primary.dark' }}>
                {isGuidanceBubble ? <TopicGuideAvatarIcon title={message.senderName} /> : useDefaultUserAvatar ? <DefaultUserAvatarIcon title={selfAvatarAlt} /> : selfAvatar}
              </Avatar>
            )}
          </Box>
        ) : null}
      </Box>

      {interactiveHtmlArtifactRefs.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', px: { xs: 2, sm: 3 }, pb: 1, width: '100%' }}>
          <Box sx={{ width: '100%', maxWidth: '100%', display: 'grid', gap: 1 }}>
            {interactiveHtmlArtifactRefs.map((artifact) => (
              <AssistantHtmlMessageBlock
                key={`${artifact.id}:${artifact.versionId || 'current'}`}
                artifactRef={artifact}
                onAutosave={onHtmlAutosave}
                onSubmit={onHtmlSubmit}
                onOpenArtifact={onOpenArtifact}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      <Dialog open={viewerOpen} onClose={() => setViewerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{message.senderName}</DialogTitle>
        <DialogContent><MessageContent message={visibleMessage} onRetryMedia={onRetryMedia} onOpenImage={onOpenImage} onOpenDiagram={onOpenDiagram} compactMediaLayout={compactMediaBubble} /></DialogContent>
      </Dialog>

      <Menu
        open={Boolean(menuPosition)}
        onClose={closeMenus}
        anchorReference="anchorPosition"
        anchorPosition={menuPosition ? { top: menuPosition.mouseY, left: menuPosition.mouseX } : undefined}
        slotProps={{
          paper: {
            sx: {
              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.72)' : 'rgba(20,22,30,0.76)',
              backdropFilter: 'blur(24px) saturate(1.18)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.18)',
              border: '1px solid',
              borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.10)' : 'rgba(226,232,240,0.12)',
            },
          },
        }}
      >
        <MenuItem onClick={handleCopy}>
          <ListItemIcon sx={{ minWidth: 32 }}><ContentCopyIcon fontSize="small" /></ListItemIcon>
          复制
        </MenuItem>
        {canEditRevision ? (
          <MenuItem onClick={openRevisionEditor}>
            <ListItemIcon sx={{ minWidth: 32 }}><EditIcon fontSize="small" /></ListItemIcon>
            重新编辑
          </MenuItem>
        ) : null}
        {onAnalyze ? (
          <MenuItem onClick={handleAnalyze}>
            <ListItemIcon sx={{ minWidth: 32 }}><InsightsIcon fontSize="small" /></ListItemIcon>
            AI分析
          </MenuItem>
        ) : null}
        {canAddImagesToReference ? (
          <MenuItem onClick={handleAddImagesToReference}>
            <ListItemIcon sx={{ minWidth: 32 }}><AddPhotoAlternateIcon fontSize="small" /></ListItemIcon>
            放到参考图
          </MenuItem>
        ) : null}
        {canFeedback ? (
          <MenuItem onClick={openFeedbackDialog}>
            <ListItemIcon sx={{ minWidth: 32 }}><RateReviewIcon fontSize="small" /></ListItemIcon>
            表达反馈
          </MenuItem>
        ) : null}
        {canPlayVoice ? (
          <MenuItem onClick={() => { closeMenus(); void toggleVoice(); }} disabled={voiceGenerating}>
            <ListItemIcon sx={{ minWidth: 32 }}>{voiceGenerating ? <CircularProgress size={18} /> : <VolumeUpIcon fontSize="small" />}</ListItemIcon>
            {voiceGenerating ? '生成语音中…' : '播放语音'}
          </MenuItem>
        ) : null}
        {canDelete ? (
          <MenuItem onClick={handleDelete}>
            <ListItemIcon sx={{ minWidth: 32 }}><DeleteIcon fontSize="small" /></ListItemIcon>
            删除
          </MenuItem>
        ) : null}
      </Menu>
      <Dialog open={feedbackDialogOpen} onClose={() => setFeedbackDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>表达反馈</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          <Stack spacing={1.25}>
            {EXPRESSION_FEEDBACK_MENU_GROUPS.map((group, index) => (
              <Box key={group.key}>
                {index > 0 ? <Divider sx={{ mb: 1.25 }} /> : null}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, mb: 0.75 }}>{group.title}</Typography>
                <Stack spacing={0.75}>
                  {group.items.map((item) => (
                    <Button key={item.kind} variant="outlined" color={group.key === 'negative' ? 'warning' : 'success'} onClick={() => handleExpressionFeedback(item.kind)} sx={{ justifyContent: 'flex-start' }}>
                      {item.label}
                    </Button>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeedbackDialogOpen(false)}>取消</Button>
        </DialogActions>
      </Dialog>
      <AppSnackbar
        open={Boolean(copyStatus)}
        autoHideDuration={1600}
        severity={copyStatus === 'error' ? 'error' : 'success'}
        message={copyStatus === 'error' ? '复制失败' : '已复制'}
        onClose={() => setCopyStatus(null)}
        offset="composer"
        alertVariant="filled"
      />

      <Dialog open={revisionEditorOpen} onClose={closeRevisionEditor} maxWidth="sm" fullWidth>
        <DialogTitle>重新编辑</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            value={revisionDraft}
            onChange={(event) => setRevisionDraft(event.target.value)}
            variant="outlined"
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRevisionEditor}>取消</Button>
          <Button variant="contained" onClick={handleSaveRevision}>生成新版本</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function areMessageBubblePropsEqual(previous: MessageBubbleProps, next: MessageBubbleProps) {
  return previous.message === next.message
    && previous.character === next.character
    && previous.characters === next.characters
    && previous.onDelete === next.onDelete
    && previous.onAnalyze === next.onAnalyze
    && previous.onExpressionFeedback === next.onExpressionFeedback
    && previous.onRetryMedia === next.onRetryMedia
    && previous.onOpenImage === next.onOpenImage
    && previous.onAddImagesToReference === next.onAddImagesToReference
    && previous.onOpenDiagram === next.onOpenDiagram
    && previous.onCharacterAvatarClick === next.onCharacterAvatarClick
    && previous.pending === next.pending
    && previous.currentUser === next.currentUser
    && previous.selfMemberId === next.selfMemberId
    && previous.privateConversation === next.privateConversation
    && previous.branchVersionInfo === next.branchVersionInfo
    && previous.onCreateRevision === next.onCreateRevision
    && previous.onSwitchRevision === next.onSwitchRevision
    && previous.onOpenArtifact === next.onOpenArtifact
    && previous.onOpenHtmlFullscreen === next.onOpenHtmlFullscreen
    && previous.onHtmlAutosave === next.onHtmlAutosave
    && previous.onHtmlSubmit === next.onHtmlSubmit;
}

export default memo(MessageBubble, areMessageBubblePropsEqual);
