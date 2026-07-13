import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Box, TextField, IconButton, Chip, CircularProgress, Tooltip, Alert } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/ImageOutlined';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/useUIStore';
import type { UserDraftActivity } from '../../services/userInputBuffer';
import type { MessageAttachment } from '../../types/message';
import type { AIModelInputCapabilities } from '../../types/settings';
import { normalizeInputCapabilities } from '../../types/settings';

interface ChatInputProps {
  mode: 'guide' | 'speakAs' | 'memberSpeak';
  characterName?: string;
  onSend: (content: string, attachments?: MessageAttachment[]) => void | Promise<void>;
  onClose?: () => void;
  placeholderOverride?: string;
  sendingLabel?: string;
  hideSpeakAsChip?: boolean;
  onSendError?: (message: string) => void;
  onOpenPanel?: () => void;
  onDraftActivity?: (activity: UserDraftActivity) => void;
  inputCapabilities?: Partial<AIModelInputCapabilities> | null;
  inputCapabilityWarning?: string;
  autoFocus?: boolean;
}

function getMobilePanelTravelDistance() {
  if (typeof window === 'undefined') return 640;
  return Math.max(320, window.innerHeight * 0.8);
}

const PANEL_OFFSET_VAR = '--pneumata-right-panel-offset';
const PANEL_BACKDROP_OPACITY_VAR = '--pneumata-right-panel-backdrop-opacity';
const PANEL_BACKDROP_MAX_OPACITY = 0.34;
const PANEL_GESTURE_SETTLE_MS = 370;

function setPanelGestureCss(offset: number) {
  if (typeof document === 'undefined') return;
  const travelDistance = getMobilePanelTravelDistance();
  const progress = 1 - Math.min(1, Math.max(0, offset) / travelDistance);
  document.documentElement.style.setProperty(PANEL_OFFSET_VAR, `${Math.max(0, offset)}px`);
  document.documentElement.style.setProperty(PANEL_BACKDROP_OPACITY_VAR, String(PANEL_BACKDROP_MAX_OPACITY * progress));
}

function clearPanelGestureCss() {
  if (typeof document === 'undefined') return;
  document.documentElement.style.removeProperty(PANEL_OFFSET_VAR);
  document.documentElement.style.removeProperty(PANEL_BACKDROP_OPACITY_VAR);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function buildAttachmentId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChatInput({ mode, characterName, onSend, onClose, placeholderOverride, sendingLabel, hideSpeakAsChip, onSendError, onOpenPanel, onDraftActivity, inputCapabilities, inputCapabilityWarning, autoFocus }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const { t } = useTranslation();
  const { setRightPanelGestureOffset, setRightPanelGestureDragging } = useUIStore(useShallow((state) => ({
    setRightPanelGestureOffset: state.setRightPanelGestureOffset,
    setRightPanelGestureDragging: state.setRightPanelGestureDragging,
  })));
  const capabilities = normalizeInputCapabilities(inputCapabilities);
  const canAttachImages = capabilities.imageInput;
  const maxAttachments = capabilities.multiImageInput ? capabilities.maxAttachments : 1;
  const acceptMimeTypes = capabilities.supportedMimeTypes.join(',');
  const panelHandleDragRef = useRef<{ startY: number; latestY: number; moved: boolean; lastDirection: 'up' | 'down' | null } | null>(null);
  const textInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelGestureTimerRef = useRef<number | null>(null);
  const panelGestureRafRef = useRef<number | null>(null);
  const pendingPanelOffsetRef = useRef<number | null>(null);
  const panelHandleCleanupRef = useRef<(() => void) | null>(null);
  const panelHandleClickSuppressedRef = useRef(false);

  useEffect(() => {
    if (!autoFocus) return;
    const frame = window.requestAnimationFrame(() => {
      textInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  const cleanupPanelHandleListeners = useCallback(() => {
    panelHandleCleanupRef.current?.();
    panelHandleCleanupRef.current = null;
  }, []);

  const publishDraftActivity = useCallback((nextText: string, focused = inputFocused) => {
    onDraftActivity?.({
      hasDraft: Boolean(nextText.trim()),
      updatedAt: Date.now(),
      focused,
    });
  }, [inputFocused, onDraftActivity]);

  const handleSend = async () => {
    const content = text.trim();
    const outgoingAttachments = attachments;
    if ((!content && outgoingAttachments.length === 0) || isSending) return;
    setIsSending(true);
    setText('');
    setAttachments([]);
    publishDraftActivity('', inputFocused);
    window.requestAnimationFrame(() => {
      textInputRef.current?.focus({ preventScroll: true });
    });
    try {
      await onSend(content, outgoingAttachments.length ? outgoingAttachments : undefined);
    } catch (error) {
      setText((current) => current || content);
      setAttachments((current) => current.length ? current : outgoingAttachments);
      publishDraftActivity(content, inputFocused);
      const message = error instanceof Error ? error.message : String(error);
      onSendError?.(message || '发送失败，请稍后重试');
    } finally {
      setIsSending(false);
      window.requestAnimationFrame(() => {
        textInputRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handlePickImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    const remainingSlots = Math.max(0, maxAttachments - attachments.length);
    if (remainingSlots <= 0) return;
    const allowed = new Set(capabilities.supportedMimeTypes);
    const files = selectedFiles
      .filter((file) => file.type.startsWith('image/') && (allowed.size === 0 || allowed.has(file.type)))
      .slice(0, remainingSlots);
    if (!files.length) {
      onSendError?.(t('common.unsupportedFileType', { defaultValue: '不支持的文件类型' }));
      return;
    }
    try {
      const now = Date.now();
      const nextAttachments = await Promise.all(files.map(async (file, index) => ({
        id: buildAttachmentId(),
        kind: 'image' as const,
        status: 'ready' as const,
        altText: file.name || `image-${index + 1}`,
        url: await fileToDataUrl(file),
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: now,
        updatedAt: now,
      })));
      setAttachments((current) => [...current, ...nextAttachments].slice(0, maxAttachments));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onSendError?.(message || '读取图片失败');
    }
  };

  useEffect(() => () => {
    cleanupPanelHandleListeners();
    if (panelGestureTimerRef.current !== null) {
      window.clearTimeout(panelGestureTimerRef.current);
    }
    if (panelGestureRafRef.current !== null) {
      window.cancelAnimationFrame(panelGestureRafRef.current);
    }
    clearPanelGestureCss();
  }, [cleanupPanelHandleListeners]);

  const schedulePanelGestureCss = useCallback((offset: number) => {
    pendingPanelOffsetRef.current = offset;
    if (panelGestureRafRef.current !== null) return;
    panelGestureRafRef.current = window.requestAnimationFrame(() => {
      panelGestureRafRef.current = null;
      const nextOffset = pendingPanelOffsetRef.current;
      if (nextOffset !== null) setPanelGestureCss(nextOffset);
    });
  }, []);

  const placeholder = placeholderOverride || (
    mode === 'speakAs'
      ? t('controls.speakAsPlaceholder', { name: characterName })
      : mode === 'memberSpeak'
        ? t('controls.memberSpeakPlaceholder')
        : t('controls.topicGuidePlaceholder')
  );

  const inputHasTextSelection = useCallback(() => {
    const input = textInputRef.current;
    if (!input) return false;
    return input.selectionStart !== null && input.selectionEnd !== null && input.selectionStart !== input.selectionEnd;
  }, []);

  const updatePanelHandleDrag = useCallback((clientY: number) => {
    const state = panelHandleDragRef.current;
    if (!state) return;
    if (inputHasTextSelection()) {
      panelHandleDragRef.current = null;
      setRightPanelGestureDragging(false);
      setRightPanelGestureOffset(null);
      clearPanelGestureCss();
      return;
    }
    const stepDeltaY = state.latestY - clientY;
    if (Math.abs(stepDeltaY) > 2) {
      state.lastDirection = stepDeltaY > 0 ? 'up' : 'down';
    }
    state.latestY = clientY;
    const deltaY = state.startY - clientY;
    if (deltaY > 6) {
      if (!state.moved) {
        setRightPanelGestureDragging(true);
        setRightPanelGestureOffset(getMobilePanelTravelDistance());
      }
      state.moved = true;
      schedulePanelGestureCss(Math.max(0, getMobilePanelTravelDistance() - deltaY));
    }
  }, [inputHasTextSelection, schedulePanelGestureCss, setRightPanelGestureDragging, setRightPanelGestureOffset]);

  const finishPanelHandleDrag = useCallback(() => {
    const state = panelHandleDragRef.current;
    panelHandleDragRef.current = null;
    if (!state) return;
    cleanupPanelHandleListeners();
    const travelDistance = getMobilePanelTravelDistance();
    const deltaY = state.startY - state.latestY;
    const shouldOpen = state.moved && state.lastDirection === 'up';
    if (state.moved) {
      panelHandleClickSuppressedRef.current = true;
      window.setTimeout(() => {
        panelHandleClickSuppressedRef.current = false;
      }, PANEL_GESTURE_SETTLE_MS);
    }
    if (shouldOpen) {
      setRightPanelGestureDragging(false);
      setRightPanelGestureOffset(0);
      schedulePanelGestureCss(0);
      onOpenPanel?.();
      panelGestureTimerRef.current = window.setTimeout(() => {
        setRightPanelGestureOffset(null);
        clearPanelGestureCss();
        panelGestureTimerRef.current = null;
      }, PANEL_GESTURE_SETTLE_MS);
      return;
    }
    if (state.moved) {
      setRightPanelGestureDragging(false);
      setRightPanelGestureOffset(travelDistance);
      schedulePanelGestureCss(travelDistance);
      panelGestureTimerRef.current = window.setTimeout(() => {
        setRightPanelGestureOffset(null);
        clearPanelGestureCss();
        panelGestureTimerRef.current = null;
      }, PANEL_GESTURE_SETTLE_MS);
    }
  }, [cleanupPanelHandleListeners, onOpenPanel, schedulePanelGestureCss, setRightPanelGestureDragging, setRightPanelGestureOffset]);

  const startPanelHandleDrag = useCallback((clientY: number, input: 'pointer' | 'touch') => {
    if (!onOpenPanel || inputHasTextSelection()) {
      panelHandleDragRef.current = null;
      return;
    }
    if (panelGestureTimerRef.current !== null) {
      window.clearTimeout(panelGestureTimerRef.current);
      panelGestureTimerRef.current = null;
    }
    if (panelGestureRafRef.current !== null) {
      window.cancelAnimationFrame(panelGestureRafRef.current);
      panelGestureRafRef.current = null;
    }
    cleanupPanelHandleListeners();
    pendingPanelOffsetRef.current = null;
    panelHandleDragRef.current = { startY: clientY, latestY: clientY, moved: false, lastDirection: null };

    if (input === 'pointer') {
      const handleMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        updatePanelHandleDrag(moveEvent.clientY);
      };
      const handleEnd = (endEvent: PointerEvent) => {
        endEvent.preventDefault();
        cleanupPanelHandleListeners();
        finishPanelHandleDrag();
      };
      window.addEventListener('pointermove', handleMove, { passive: false });
      window.addEventListener('pointerup', handleEnd, { passive: false });
      window.addEventListener('pointercancel', handleEnd, { passive: false });
      panelHandleCleanupRef.current = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
      };
      return;
    }

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touch = moveEvent.touches[0];
      if (!touch) return;
      moveEvent.preventDefault();
      updatePanelHandleDrag(touch.clientY);
    };
    const handleTouchEnd = (endEvent: TouchEvent) => {
      endEvent.preventDefault();
      cleanupPanelHandleListeners();
      finishPanelHandleDrag();
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    panelHandleCleanupRef.current = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [cleanupPanelHandleListeners, finishPanelHandleDrag, inputHasTextSelection, onOpenPanel, updatePanelHandleDrag]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        px: { xs: 1.5, sm: 2.5, md: 3 },
        pt: 1,
        pb: onOpenPanel ? 'calc(env(safe-area-inset-bottom, 0px) + 7px)' : 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        bgcolor: 'transparent',
        flexShrink: 0,
        opacity: 1,
        pointerEvents: 'auto',
        position: 'relative',
        overflow: 'visible',
        isolation: 'isolate',
        '& > *': {
          position: 'relative',
          zIndex: 1,
        },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 760,
          mx: 'auto',
          p: attachments.length || inputCapabilityWarning ? { xs: 0.85, sm: 1 } : { xs: 0.65, sm: 0.75 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.10)' : 'rgba(226,232,240,0.12)',
          bgcolor: (theme) => {
            if (isSending) return theme.palette.mode === 'light' ? 'rgba(255,255,255,0.70)' : 'rgba(20,22,30,0.54)';
            return theme.palette.mode === 'light' ? 'rgba(255,255,255,0.64)' : 'rgba(13,15,22,0.50)';
          },
          backdropFilter: (theme) => theme.palette.mode === 'light' ? 'blur(24px) saturate(1.10)' : 'blur(22px) saturate(1.04)',
          WebkitBackdropFilter: (theme) => theme.palette.mode === 'light' ? 'blur(24px) saturate(1.10)' : 'blur(22px) saturate(1.04)',
          boxShadow: (theme) => theme.palette.mode === 'light'
            ? '0 18px 42px rgba(15,23,42,0.12), 0 1px 0 rgba(255,255,255,0.72) inset'
            : '0 18px 44px rgba(0,0,0,0.30), 0 1px 0 rgba(255,255,255,0.10) inset',
        }}
      >
        {attachments.length ? (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
          {attachments.map((attachment) => (
            <Chip
              key={attachment.id}
              size="small"
              label={attachment.altText || 'Image'}
              onDelete={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
              avatar={attachment.url ? <Box component="img" src={attachment.url} alt="" sx={{ width: 24, height: 24, objectFit: 'cover' }} /> : undefined}
              variant="outlined"
            />
          ))}
        </Box>
        ) : null}
        {attachments.length > 0 && inputCapabilityWarning ? (
        <Alert severity="warning" sx={{ mb: 1, py: 0 }}>
          {inputCapabilityWarning}
        </Alert>
        ) : null}
        <Box
        sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, width: '100%', touchAction: 'pan-y' }}
      >
        {mode === 'speakAs' && characterName && !hideSpeakAsChip ? (
          <Chip
            label={characterName}
            onDelete={onClose || undefined}
            deleteIcon={onClose ? <CloseIcon fontSize="small" /> : undefined}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ flexShrink: 0 }}
          />
        ) : null}
        {canAttachImages ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptMimeTypes}
              multiple={capabilities.multiImageInput}
              hidden
              onChange={handlePickImages}
            />
            <Tooltip title={capabilities.multiImageInput ? '添加图片' : '添加图片'}>
              <span>
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || attachments.length >= maxAttachments}
                  sx={{ flexShrink: 0, width: 42, height: 42 }}
                >
                  <ImageIcon />
                </IconButton>
              </span>
            </Tooltip>
          </>
        ) : null}
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            publishDraftActivity(e.target.value, inputFocused);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setInputFocused(true);
            publishDraftActivity(text, true);
          }}
          onBlur={() => {
            setInputFocused(false);
            publishDraftActivity(text, false);
          }}
          inputRef={textInputRef}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2.25,
              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(248,250,252,0.74)' : 'rgba(255,255,255,0.065)',
              '& fieldset': {
                borderColor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.09)' : 'rgba(226,232,240,0.11)',
              },
            },
          }}
        />
        <Tooltip title={isSending ? (sendingLabel || '等待角色发言结束') : ''} disableHoverListener={!isSending} arrow>
          <span>
            <IconButton
              color="primary"
              onClick={() => void handleSend()}
              onMouseDown={(event) => event.preventDefault()}
              disabled={(!text.trim() && attachments.length === 0) || isSending}
              sx={{
                flexShrink: 0,
                width: 42,
                height: 42,
                bgcolor: (text.trim() || attachments.length > 0) && !isSending ? 'primary.main' : 'action.hover',
                color: (text.trim() || attachments.length > 0) && !isSending ? 'primary.contrastText' : 'text.disabled',
                boxShadow: (text.trim() || attachments.length > 0) && !isSending ? '0 10px 24px rgba(15,23,42,0.18)' : 'none',
                '&:hover': {
                  bgcolor: (text.trim() || attachments.length > 0) && !isSending ? 'primary.dark' : 'action.hover',
                },
              }}
            >
              {isSending ? <CircularProgress size={22} /> : <SendIcon />}
            </IconButton>
          </span>
        </Tooltip>
        </Box>
        {onOpenPanel ? (
        <Box
          role="button"
          aria-label="打开会话面板"
          title="点击或向上拖拽打开会话面板"
          draggable={false}
          onClick={() => {
            if (panelHandleClickSuppressedRef.current) {
              panelHandleClickSuppressedRef.current = false;
              return;
            }
            onOpenPanel();
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            event.preventDefault();
            event.stopPropagation();
            if (touch) startPanelHandleDrag(touch.clientY, 'touch');
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') return;
            event.preventDefault();
            event.stopPropagation();
            startPanelHandleDrag(event.clientY, 'pointer');
          }}
          sx={{
            width: '100%',
            height: 18,
            display: 'grid',
            placeItems: 'center',
            mt: 0.2,
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            '&:active': {
              cursor: 'grabbing',
            },
          }}
        >
          <Box
            sx={{
              width: 42,
              height: 4,
              borderRadius: 2,
              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.22)' : 'rgba(226,232,240,0.28)',
              boxShadow: (theme) => theme.palette.mode === 'light' ? '0 1px 0 rgba(255,255,255,0.70)' : '0 1px 0 rgba(255,255,255,0.08)',
            }}
          />
        </Box>
        ) : null}
      </Box>
    </Box>
  );
}
