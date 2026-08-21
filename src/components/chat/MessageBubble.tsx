import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
import { speechTextFromMessage, usesManagedSpeechProfile } from '../../services/speech';
import { synthesizeSpeechWithAdapter } from '../../services/aiGenerationAdapter';
import { cacheSpeechPlayback, clearCachedSpeechPlayback, getCachedSpeechPlayback, hydrateCachedSpeechPlayback } from '../../services/speechPlaybackCache';

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
let hasShownAutoplayBlockedNotice = false;

function smoothWaveform(values: number[], radius: number) {
  if (values.length < 2 || radius < 1) return values;
  const sigma = Math.max(1, radius / 2);
  const weights = Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const distance = index - radius;
    return Math.exp(-(distance * distance) / (2 * sigma * sigma));
  });
  return values.map((_, index) => {
    let total = 0;
    let weightTotal = 0;
    weights.forEach((weight, weightIndex) => {
      const sourceIndex = Math.max(0, Math.min(values.length - 1, index + weightIndex - radius));
      total += values[sourceIndex] * weight;
      weightTotal += weight;
    });
    return total / weightTotal;
  });
}

function waveformPath(amplitudes: number[], width: number, height: number) {
  if (!amplitudes.length) return '';
  const step = width / Math.max(amplitudes.length - 1, 1);
  const points = amplitudes.map((amplitude, index) => [
    index * step,
    height - (Math.max(0, Math.min(1, amplitude)) * height * 0.86 + height * 0.07),
  ] as const);
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const controlOneX = current[0] + (next[0] - previous[0]) / 9;
    const controlOneY = current[1] + (next[1] - previous[1]) / 9;
    const controlTwoX = next[0] - (following[0] - current[0]) / 9;
    const controlTwoY = next[1] - (following[1] - current[1]) / 9;
    path += ` C ${controlOneX} ${controlOneY} ${controlTwoX} ${controlTwoY} ${next[0]} ${next[1]}`;
  }
  return path;
}

function formatRemainingVoiceTime(seconds: number) {
  const rounded = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return minutes > 0 ? `${minutes}′${String(remainingSeconds).padStart(2, '0')}″` : `${remainingSeconds}″`;
}

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
  const hidePrivateChatIdentitySetting = useSettingsStore((state) => state.hidePrivateChatIdentity);
  const chatAppearance = useSettingsStore((state) => state.chatAppearance);
  const developerMode = useSettingsStore((state) => state.developerMode);
  const showWithdrawnMessageContent = useSettingsStore((state) => state.developerUI.showWithdrawnMessageContent);
  const navigate = useNavigate();
  const location = useLocation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [promptAttachment, setPromptAttachment] = useState<MessageAttachment | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'success' | 'error' | null>(null);
  const voiceCacheKey = `message:${message.serverId || message.id}`;
  const [voiceUrl, setVoiceUrl] = useState<string | null>(() => getCachedSpeechPlayback(voiceCacheKey));
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceGenerationStage, setVoiceGenerationStage] = useState<'synthesizing' | 'preparing' | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceProgressLineRef = useRef<HTMLDivElement | null>(null);
  const voiceRemainingTimeRef = useRef<HTMLSpanElement | null>(null);
  const voiceTrackRef = useRef<HTMLDivElement | null>(null);
  const voiceSeekingRef = useRef(false);
  const autoPlayVoiceRef = useRef(false);
  const [voiceBars, setVoiceBars] = useState<number[]>([]);
  const voiceWaveformPath = useMemo(() => waveformPath(voiceBars, 260, 38), [voiceBars]);
  useEffect(() => {
    if (voiceUrl) return;
    let cancelled = false;
    void hydrateCachedSpeechPlayback(voiceCacheKey).then((url) => {
      if (!cancelled && url) setVoiceUrl(url);
    });
    return () => { cancelled = true; };
  }, [voiceCacheKey, voiceUrl]);
  useEffect(() => {
    if (!voiceUrl) return;
    let cancelled = false;
    const loadWaveform = async () => {
      try {
        const audioData = await fetch(voiceUrl).then((response) => response.arrayBuffer());
        const AudioContextConstructor = window.AudioContext;
        if (!AudioContextConstructor) return;
        const context = new AudioContextConstructor();
        const decoded = await context.decodeAudioData(audioData.slice(0));
        await context.close();
        const samples = decoded.getChannelData(0);
        const bars = 96;
        const samplesPerBar = Math.max(1, Math.floor(samples.length / bars));
        const rawEnergy = Array.from({ length: bars }, (_, index) => {
          const start = index * samplesPerBar;
          const end = Math.min(samples.length, start + samplesPerBar);
          let energy = 0;
          for (let position = start; position < end; position += 1) {
            const sample = samples[position] || 0;
            energy += sample * sample;
          }
          return Math.sqrt(energy / Math.max(1, end - start));
        });
        const smoothedEnergy = smoothWaveform(rawEnergy, 7);
        const sortedEnergy = [...smoothedEnergy].sort((left, right) => left - right);
        const quietEnergy = sortedEnergy[Math.floor(sortedEnergy.length * 0.08)] || 0;
        const loudEnergy = sortedEnergy[Math.max(0, Math.ceil(sortedEnergy.length * 0.92) - 1)] || quietEnergy;
        const dynamicRange = loudEnergy - quietEnergy;
        const curve = dynamicRange > 0.000001
          ? smoothWaveform(smoothedEnergy.map((energy) => {
            const relativeEnergy = Math.max(0, Math.min(1, (energy - quietEnergy) / dynamicRange));
            return Math.max(0, Math.min(1, 0.5 + (relativeEnergy - 0.5) * 1.22));
          }), 2)
          : Array.from({ length: bars }, () => 0.5);
        if (!cancelled) setVoiceBars(curve);
      } catch {
        if (!cancelled) setVoiceBars([]);
      }
    };
    void loadWaveform();
    if (autoPlayVoiceRef.current) {
      autoPlayVoiceRef.current = false;
      window.setTimeout(() => {
        void voiceAudioRef.current?.play().catch(() => {
          if (!hasShownAutoplayBlockedNotice) {
            hasShownAutoplayBlockedNotice = true;
            setVoiceError('浏览器阻止了自动播放，请再次点击播放');
          }
        });
      }, 0);
    }
    return () => { cancelled = true; };
  }, [message.timestamp, voiceUrl]);
  useEffect(() => {
    if (!voicePlaying) return undefined;
    let frameId = 0;
    const updateProgress = () => {
      const audio = voiceAudioRef.current;
      if (audio?.duration && voiceProgressLineRef.current) {
        const progress = Math.max(0, Math.min(1, audio.currentTime / audio.duration));
        voiceProgressLineRef.current.style.left = `${progress * 100}%`;
        voiceTrackRef.current?.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
        if (voiceRemainingTimeRef.current) voiceRemainingTimeRef.current.textContent = formatRemainingVoiceTime(audio.duration - audio.currentTime);
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };
    frameId = window.requestAnimationFrame(updateProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [voicePlaying]);
  const aiProfiles = useSettingsStore((state) => state.aiProfiles);
  const ttsProfiles = useMemo(() => aiProfiles.filter((profile) => profile.type === 'tts'), [aiProfiles]);
  const ttsModel = ttsProfiles.find((profile) => profile.id === (character?.modelProfileIds?.tts || character?.modelProfileIds?.audio))
    || ttsProfiles.find((profile) => profile.isDefault)
    || ttsProfiles[0]
    || useSettingsStore.getState().aiProfiles.find((profile) => profile.type === 'audio' && (profile.audioCapability === 'tts' || profile.audioCapability === 'both'));
  const canPlayVoice = Boolean(message.type === 'ai' && !pending && message.content.trim() && ttsModel && character?.voiceConfig?.voiceName);
  const toggleVoice = async () => {
    if (!canPlayVoice) return;
    if (!voiceUrl) {
      autoPlayVoiceRef.current = true;
      setVoiceGenerationStage('synthesizing');
      try {
        setVoiceError(null);
        const speechText = speechTextFromMessage(message.content);
        if (!speechText) throw new Error('消息中没有可朗读的文字');
        if (ttsModel && usesManagedSpeechProfile(ttsModel)) {
          const result = await api.synthesizeSpeech({
            providerCode: ttsModel.provider.startsWith('managed:') ? ttsModel.provider.slice('managed:'.length) : undefined,
            modelId: ttsModel.model,
            text: speechText,
            voice: character?.voiceConfig?.voiceName,
            style: [character?.voiceConfig?.style, character?.voiceConfig?.instructions].filter(Boolean).join('；') || undefined,
            emotion: character?.voiceConfig?.emotion,
            speed: character?.voiceConfig?.rate ? Number.parseFloat(character.voiceConfig.rate) || undefined : undefined,
            pitch: character?.voiceConfig?.pitch ? Number.parseFloat(character.voiceConfig.pitch) || undefined : undefined,
          });
          setVoiceGenerationStage('preparing');
          const audioResponse = await fetch(result.audioDataUrl);
          if (!audioResponse.ok) throw new Error('语音缓存创建失败');
          const audioBlob = await audioResponse.blob();
          const url = cacheSpeechPlayback(voiceCacheKey, URL.createObjectURL(audioBlob), audioBlob.size, audioBlob);
          setVoiceUrl(url);
        } else if (ttsModel) {
          const result = await synthesizeSpeechWithAdapter({ profile: ttsModel, input: speechText, voice: character?.voiceConfig?.voiceName, format: 'mp3', intent: 'chat-audio' });
          setVoiceGenerationStage('preparing');
          const url = cacheSpeechPlayback(voiceCacheKey, result.objectUrl, result.blob.size, result.blob);
          setVoiceUrl(url);
        }
      } catch (error) {
        setVoiceError(error instanceof Error ? error.message : '语音播放失败');
      } finally {
        setVoiceGenerationStage(null);
      }
      return;
    }
    const audio = voiceAudioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play(); else audio.pause();
  };
  const clearVoiceCache = () => {
    voiceAudioRef.current?.pause();
    clearCachedSpeechPlayback(voiceCacheKey);
    setVoiceUrl(null);
    setVoicePlaying(false);
    if (voiceProgressLineRef.current) voiceProgressLineRef.current.style.left = '0%';
    setVoiceBars([]);
  };
  const voiceWaveformStyle = chatAppearance.voiceWaveformStyle || 'wave';
  const visibleVoiceBars = voiceBars.length ? voiceBars.map((sample) => 20 + sample * 80) : Array.from({ length: 36 }, () => 28);
  const seekVoice = (clientX: number) => {
    const audio = voiceAudioRef.current;
    const track = voiceTrackRef.current;
    if (!audio || !audio.duration || !track) return;
    const rect = track.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = progress * audio.duration;
    if (voiceProgressLineRef.current) voiceProgressLineRef.current.style.left = `${progress * 100}%`;
    voiceTrackRef.current?.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    if (voiceRemainingTimeRef.current) voiceRemainingTimeRef.current.textContent = formatRemainingVoiceTime(audio.duration - audio.currentTime);
  };
  const voiceBar = voiceUrl ? (
    <Box sx={(theme) => ({
      '--voice-accent': theme.palette.primary.main,
      '--voice-secondary': theme.palette.secondary.main,
      '--voice-muted': theme.palette.mode === 'dark' ? 'rgba(255,255,255,.24)' : 'rgba(15,23,42,.18)',
      display: 'flex', alignItems: 'center', gap: 0.65, width: 'min(320px, 100%)', px: 0.9, py: 0.55, borderRadius: 2.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider',
    })}>
      <audio
        ref={voiceAudioRef}
        src={voiceUrl}
        preload="metadata"
        onPlay={() => setVoicePlaying(true)}
        onPause={() => setVoicePlaying(false)}
        onLoadedMetadata={(event) => {
          if (voiceRemainingTimeRef.current) voiceRemainingTimeRef.current.textContent = formatRemainingVoiceTime(event.currentTarget.duration || 0);
        }}
        onEnded={() => {
          setVoicePlaying(false);
          if (voiceProgressLineRef.current) voiceProgressLineRef.current.style.left = '0%';
          voiceTrackRef.current?.setAttribute('aria-valuenow', '0');
          if (voiceRemainingTimeRef.current) voiceRemainingTimeRef.current.textContent = formatRemainingVoiceTime(event.currentTarget.duration || 0);
        }}
        onError={() => {
          clearVoiceCache();
          setVoiceError('语音缓存已失效，请重新播放');
        }}
        style={{ display: 'none' }}
      />
      <IconButton size="small" onClick={() => void toggleVoice()} aria-label={voicePlaying ? '暂停语音' : '播放语音'}>
        {voicePlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
      </IconButton>
      <Box
        ref={voiceTrackRef}
        role="slider"
        tabIndex={0}
        aria-label="语音播放进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        sx={{ position: 'relative', flex: 1, height: 30, cursor: 'pointer', touchAction: 'none', outline: 'none', '&:focus-visible': { borderRadius: 1, boxShadow: '0 0 0 2px rgba(255,112,67,.48)' } }}
        onPointerDown={(event) => {
          voiceSeekingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekVoice(event.clientX);
        }}
        onPointerMove={(event) => { if (voiceSeekingRef.current) seekVoice(event.clientX); }}
        onPointerUp={(event) => {
          voiceSeekingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          seekVoice(event.clientX);
        }}
        onPointerCancel={() => { voiceSeekingRef.current = false; }}
        onKeyDown={(event) => {
          const audio = voiceAudioRef.current;
          if (!audio?.duration) return;
          const stepSeconds = event.shiftKey ? 10 : 5;
          if (event.key === 'ArrowLeft') { event.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - stepSeconds); }
          else if (event.key === 'ArrowRight') { event.preventDefault(); audio.currentTime = Math.min(audio.duration, audio.currentTime + stepSeconds); }
          else if (event.key === 'Home') { event.preventDefault(); audio.currentTime = 0; }
          else if (event.key === 'End') { event.preventDefault(); audio.currentTime = audio.duration; }
          else return;
          if (voiceProgressLineRef.current) voiceProgressLineRef.current.style.left = `${(audio.currentTime / audio.duration) * 100}%`;
          if (voiceRemainingTimeRef.current) voiceRemainingTimeRef.current.textContent = formatRemainingVoiceTime(audio.duration - audio.currentTime);
        }}
      >
        {voiceWaveformStyle === 'blocks' || voiceWaveformStyle === 'pulse' ? (
          <Box aria-hidden="true" sx={{ height: '100%', display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden' }}>
            {visibleVoiceBars.map((peak, index) => <Box key={index} sx={{ flex: 1, minWidth: 2, height: `${Math.max(voiceWaveformStyle === 'pulse' ? 18 : 26, peak)}%`, borderRadius: 99, bgcolor: 'var(--voice-accent)', opacity: voiceWaveformStyle === 'pulse' ? 0.42 + (peak / 100) * 0.58 : 0.82, transformOrigin: 'center', animation: voiceWaveformStyle === 'pulse' && voicePlaying ? `voicePulse ${0.78 + (index % 5) * 0.11}s ease-in-out ${-(index % 4) * 0.12}s infinite alternate` : 'none', '@keyframes voicePulse': { from: { transform: 'scaleY(.72)' }, to: { transform: 'scaleY(1.08)' } }, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />)}
          </Box>
        ) : voiceWaveformStyle === 'spectrum' ? (
          <Box aria-hidden="true" sx={{ height: '100%', display: 'flex', alignItems: 'center', gap: '2px', overflow: 'hidden' }}>
            {visibleVoiceBars.map((peak, index) => <Box key={index} sx={{ flex: 1, minWidth: 2, height: `${Math.max(24, peak)}%`, borderRadius: 1, background: 'linear-gradient(180deg, var(--voice-secondary), var(--voice-accent))', opacity: 0.44 + (index % 5) * 0.11, boxShadow: '0 0 6px color-mix(in srgb, var(--voice-secondary) 55%, transparent)' }} />)}
          </Box>
        ) : voiceWaveformStyle === 'orbit' ? (
          <Box aria-hidden="true" sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
            {visibleVoiceBars.filter((_, index) => index % 5 === 0).map((peak, index) => <Box key={index} sx={{ position: 'absolute', left: `${index * 7.15}%`, top: `${50 - peak * 0.25}%`, width: 4 + peak * 0.03, height: 4 + peak * 0.03, borderRadius: '50%', bgcolor: index % 2 ? 'var(--voice-secondary)' : 'var(--voice-accent)', opacity: 0.46 + peak / 190, boxShadow: '0 0 8px color-mix(in srgb, var(--voice-accent) 65%, transparent)', animation: voicePlaying ? `voiceOrbit ${1.1 + (index % 4) * 0.2}s ease-in-out ${-index * 0.13}s infinite alternate` : 'none', '@keyframes voiceOrbit': { from: { transform: 'translateY(-4px) scale(.84)' }, to: { transform: 'translateY(4px) scale(1.12)' } }, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />)}
            <Box sx={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed var(--voice-muted)', opacity: 0.5 }} />
          </Box>
        ) : (
          <svg viewBox="0 0 260 38" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
            <defs><linearGradient id={`voice-ribbon-${message.id}`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="var(--voice-accent)" /><stop offset="1" stopColor="var(--voice-secondary)" /></linearGradient></defs>
            {voiceWaveformPath ? <path d={voiceWaveformPath} fill="none" stroke={voiceWaveformStyle === 'ribbon' ? `url(#voice-ribbon-${message.id})` : voiceWaveformStyle === 'neon' ? 'var(--voice-secondary)' : 'var(--voice-accent)'} strokeWidth={voiceWaveformStyle === 'ribbon' ? '3.2' : voiceWaveformStyle === 'neon' ? '2.1' : '2'} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={voiceWaveformStyle === 'neon' ? { filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--voice-secondary) 90%, transparent)) drop-shadow(0 0 9px color-mix(in srgb, var(--voice-accent) 62%, transparent))' } : undefined} /> : null}
          </svg>
        )}
        <Box ref={voiceProgressLineRef} sx={{ position: 'absolute', top: -3, bottom: -3, left: '0%', width: 2, borderRadius: 2, bgcolor: 'var(--voice-accent)', boxShadow: '0 0 8px color-mix(in srgb, var(--voice-accent) 66%, transparent)', transform: 'translateX(-1px)', pointerEvents: 'none', willChange: 'left' }} />
      </Box>
      <Typography ref={voiceRemainingTimeRef} component="span" variant="caption" aria-label="剩余播放时长" sx={{ minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'text.secondary', fontWeight: 650 }}>
        --″
      </Typography>
    </Box>
  ) : null;
  const voiceGeneratingIndicator = voiceGenerationStage ? (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', width: 'fit-content', px: 1, py: 0.55, borderRadius: 2, bgcolor: 'action.hover' }}>
      <CircularProgress size={14} />
      <Typography variant="caption" color="text.secondary">{voiceGenerationStage === 'synthesizing' ? '正在请求语音合成…' : '正在准备播放…'}</Typography>
    </Stack>
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
  }, [htmlArtifactRefs, message]);

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const openMenuAt = (x: number, y: number) => {
    if (pending) return;
    // 普通消息菜单不应沿用上一次图片菜单留下的提示词附件。
    setPromptAttachment(null);
    setPromptDialogOpen(false);
    setMenuPosition({ mouseX: x, mouseY: y });
  };

  const closeMenus = () => {
    setMenuPosition(null);
  };

  const openPromptMenu = (attachment: MessageAttachment, event: React.MouseEvent<HTMLElement>) => {
    openMenuAt(event.clientX, event.clientY);
    setPromptAttachment(attachment);
  };

  const closePromptDialog = () => {
    setPromptDialogOpen(false);
    setPromptAttachment(null);
  };

  const handleCopyPrompt = async () => {
    if (!promptAttachment?.promptText) return;
    const copied = await copyTextToClipboard(promptAttachment.promptText);
    setCopyStatus(copied ? 'success' : 'error');
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
  const hidePrivateChatIdentity = privateConversation && hidePrivateChatIdentitySetting && !isGuidanceBubble;
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
  const bubbleContentMaxWidth = contentMaxWidth;
  const hiddenIdentityMessageWidth = hidePrivateChatIdentity
    ? { xs: 'calc(100% - 16px)', sm: 'calc(100% - 24px)' }
    : undefined;
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
      <Box data-message-id={message.id} data-message-type={message.type} sx={{ display: 'flex', justifyContent: wrapperJustify, px: hidePrivateChatIdentity ? { xs: 2, sm: 3 } : 2, py: 0.75, gap: hidePrivateChatIdentity ? 0 : 1.25, alignItems: 'flex-start' }}>
        {!isUser && !hidePrivateChatIdentity ? (
          <Box onClick={handleAvatarClick} sx={{ cursor: message.type === 'ai' && !pending ? 'pointer' : 'default', flexShrink: 0 }}>
            {avatar && isImageAvatar(avatar) ? (
              <Avatar src={resolveSafeAvatarSrc(avatar)} alt={message.senderName} slotProps={{ img: { loading: 'lazy', decoding: 'async', onError: () => rememberFailedAvatarUrl(avatar) } }} sx={{ width: 38, height: 38 }} />
            ) : (
              <Avatar sx={{ width: 38, height: 38, bgcolor: resolvedStyle?.backgroundColor || 'primary.main' }}>{message.senderName.slice(0, 1)}</Avatar>
            )}
          </Box>
        ) : null}

        <Box sx={{ width: hiddenIdentityMessageWidth, maxWidth: bubbleContentMaxWidth, minWidth: 0, display: 'grid', gap: 0.35, justifyItems: isUser ? 'end' : 'start' }}>
          {!hidePrivateChatIdentity || (branchVersionInfo && branchVersionInfo.total > 1 && onSwitchRevision) ? (
          <Stack
            direction="row"
            spacing={0.5}
            title={formatTimestamp(message.timestamp)}
            sx={{ color: 'text.secondary', px: 0.5, width: 'fit-content', maxWidth: '100%', alignItems: 'center' }}
          >
            {!hidePrivateChatIdentity ? (
              <Typography variant="caption" sx={{ fontWeight: 500, textAlign: isUser ? 'right' : 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {message.senderName}
              </Typography>
            ) : null}
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
          ) : null}
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
            ) : <MessageContent message={visibleMessage} onRetryMedia={onRetryMedia} onOpenImage={onOpenImage} onOpenPrompt={openPromptMenu} onOpenDiagram={onOpenDiagram} compactMediaLayout={compactMediaBubble} />}
          </Box>
          {voiceGeneratingIndicator || voiceBar}
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

        {isUser && !hidePrivateChatIdentity ? (
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
        <DialogContent><MessageContent message={visibleMessage} onRetryMedia={onRetryMedia} onOpenImage={onOpenImage} onOpenPrompt={openPromptMenu} onOpenDiagram={onOpenDiagram} compactMediaLayout={compactMediaBubble} /></DialogContent>
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
        {promptAttachment?.promptText ? (
          <MenuItem onClick={() => { closeMenus(); setPromptDialogOpen(true); }}>
            <ListItemIcon sx={{ minWidth: 32 }}><InsightsIcon fontSize="small" /></ListItemIcon>
            查看提示词
          </MenuItem>
        ) : null}
        {canEditRevision ? (
          <MenuItem onClick={openRevisionEditor}>
            <ListItemIcon sx={{ minWidth: 32 }}><EditIcon fontSize="small" /></ListItemIcon>
            重新编辑
          </MenuItem>
        ) : null}
        {canPlayVoice ? (
          <MenuItem onClick={() => { closeMenus(); void toggleVoice(); }} disabled={Boolean(voiceGenerationStage)}>
            <ListItemIcon sx={{ minWidth: 32 }}>{voiceGenerationStage ? <CircularProgress size={18} /> : <VolumeUpIcon fontSize="small" />}</ListItemIcon>
            {voiceGenerationStage ? '生成语音中…' : '播放语音'}
          </MenuItem>
        ) : null}
        {voiceUrl ? (
          <MenuItem onClick={() => { closeMenus(); clearVoiceCache(); }}>
            <ListItemIcon sx={{ minWidth: 32 }}><VolumeUpIcon fontSize="small" /></ListItemIcon>
            清除语音缓存
          </MenuItem>
        ) : null}
        {(canPlayVoice || voiceUrl) && (onAnalyze || canAddImagesToReference || canFeedback || canDelete) ? <Divider /> : null}
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
        {canDelete ? (
          <MenuItem onClick={handleDelete}>
            <ListItemIcon sx={{ minWidth: 32 }}><DeleteIcon fontSize="small" /></ListItemIcon>
            删除
          </MenuItem>
        ) : null}
      </Menu>
      <Dialog open={promptDialogOpen && Boolean(promptAttachment)} onClose={closePromptDialog} maxWidth="sm" fullWidth>
        <DialogTitle>图片提示词</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          <Typography
            component="pre"
            sx={{
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              fontFamily: 'inherit',
              lineHeight: 1.7,
            }}
          >
            {promptAttachment?.promptText || ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCopyPrompt} disabled={!promptAttachment?.promptText}>复制</Button>
          <Button onClick={closePromptDialog}>关闭</Button>
        </DialogActions>
      </Dialog>
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
      <AppSnackbar
        open={Boolean(voiceError)}
        autoHideDuration={3000}
        onClose={() => setVoiceError(null)}
        severity="error"
        message={voiceError || ''}
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
