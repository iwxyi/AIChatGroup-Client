import { useEffect, useRef, useState } from 'react';
import { Avatar, Box, Card, CardActionArea, Chip, CircularProgress, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import MoreIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { AICharacter } from '../../types/character';
import { formatExpertiseList } from '../../utils/expertise';
import { isImageAvatar } from '../../utils/avatar';
import { rememberFailedAvatarUrl, resolveSafeAvatarSrc } from '../../utils/avatarFallback';
import { buildInteractiveSurfaceSx, buildSelectionRailSx, microPillChipSx } from '../../styles/interaction';
import { motion, reducedMotionSx, transition } from '../../styles/motion';
import { useTranslation } from 'react-i18next';
import { avatarGenerationQueue, type AvatarGenerationStatus } from '../../services/avatarGenerationQueue';
import { getCharacterCompletionTaskStatus, subscribeCharacterCompletionQueue, type CharacterCompletionStatus } from '../../services/characterCompletionQueue';

interface CharacterShowcaseCardProps {
  character: AICharacter;
  onEdit?: () => void;
  onDelete?: () => void;
  onStartDirectChat?: () => void;
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selectable?: boolean;
  selectionMode?: boolean;
}

function getPrimaryVisualImage(character: AICharacter) {
  const images = Array.isArray(character.visualIdentity?.referenceImages) ? character.visualIdentity.referenceImages : [];
  return images.find((image) => image.id === character.visualIdentity?.primaryReferenceImageId || image.isPrimary) || images[0] || null;
}

function VisualPlaceholder({ name }: { name: string }) {
  return (
    <Box
      aria-label={`${name} 暂无形象图`}
      role="img"
      sx={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        color: 'primary.main',
        bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.045)' : 'rgba(120,156,220,0.08)',
        overflow: 'hidden',
        '& svg': {
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: 0.72,
        },
        '@media (hover: hover)': {
          '&:hover svg': {
            animation: 'character-showcase-placeholder 1.8s ease-in-out 1',
          },
        },
        '@keyframes character-showcase-placeholder': {
          '0%, 100%': { opacity: 0.48, transform: 'translateY(2px)' },
          '50%': { opacity: 0.82, transform: 'translateY(-2px)' },
        },
        ...reducedMotionSx,
      }}
    >
      <svg viewBox="0 0 180 220" fill="none" aria-hidden="true">
        <rect x="30" y="22" width="120" height="174" rx="22" stroke="currentColor" strokeWidth="1.5" opacity="0.38" />
        <path d="M30 58V44c0-12 10-22 22-22h14M150 58V44c0-12-10-22-22-22h-14M30 160v14c0 12 10 22 22 22h14M150 160v14c0 12-10 22-22 22h-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.72" />
        <circle cx="90" cy="104" r="42" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 8" opacity="0.62" />
        <ellipse cx="90" cy="104" rx="21" ry="42" stroke="currentColor" strokeWidth="2" opacity="0.82" />
        <path d="M48 104h84M90 62v84" stroke="currentColor" strokeWidth="1" opacity="0.38" />
        <circle cx="90" cy="104" r="5" fill="currentColor" />
        <circle cx="90" cy="62" r="3" fill="currentColor" opacity="0.72" />
        <circle cx="132" cy="104" r="3" fill="currentColor" opacity="0.72" />
        <path d="M57 169h66M69 181h42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.58" />
      </svg>
    </Box>
  );
}

export default function CharacterShowcaseCard({ character, onEdit, onDelete, onStartDirectChat, onClick, onLongPress, selected, selectable, selectionMode }: CharacterShowcaseCardProps) {
  const { t, i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [visualGenerationStatus, setVisualGenerationStatus] = useState<AvatarGenerationStatus | null>(null);
  const [avatarGenerationStatus, setAvatarGenerationStatus] = useState<AvatarGenerationStatus | null>(null);
  const [visualCompletionStatus, setVisualCompletionStatus] = useState<CharacterCompletionStatus | null>(null);
  const [generatedVisualUrl, setGeneratedVisualUrl] = useState<string | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const visualImage = getPrimaryVisualImage(character);
  const visualGenerating = visualGenerationStatus === 'queued' || visualGenerationStatus === 'running'
    || visualCompletionStatus === 'queued' || visualCompletionStatus === 'running';
  const avatarGenerating = avatarGenerationStatus === 'queued' || avatarGenerationStatus === 'running';
  const expertise = formatExpertiseList(Array.isArray(character.expertise) ? character.expertise : [], i18n.language).slice(0, 3);
  const background = typeof character.background === 'string' ? character.background.trim() : '';
  const speakingStyle = typeof character.speakingStyle === 'string' ? character.speakingStyle.trim() : '';
  const description = background || speakingStyle;

  useEffect(() => {
    const updateCompletionStatus = () => setVisualCompletionStatus(getCharacterCompletionTaskStatus(character.id, 'visual'));
    updateCompletionStatus();
    const unsubscribeCompletion = subscribeCharacterCompletionQueue(updateCompletionStatus);
    const unsubscribeImage = avatarGenerationQueue.subscribeTarget(`character-visual:${character.id}`, (state) => {
      setVisualGenerationStatus(state.status);
      setGeneratedVisualUrl(state.status === 'succeeded' ? state.imageDataUrl : null);
    });
    const unsubscribeAvatar = avatarGenerationQueue.subscribeTarget(`character:${character.id}`, (state) => setAvatarGenerationStatus(state.status));
    return () => {
      unsubscribeCompletion();
      unsubscribeImage();
      unsubscribeAvatar();
    };
  }, [character.id]);

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (!onLongPress) return;
    longPressTriggeredRef.current = false;
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
      clearPressTimer();
    }, 450);
  };

  const handleClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onClick?.();
  };

  const handleMenuAction = (action?: () => void) => {
    longPressTriggeredRef.current = false;
    setAnchorEl(null);
    action?.();
  };

  return (
    <Card
      variant="outlined"
      sx={{
        ...buildInteractiveSurfaceSx({ selected: Boolean(selected), radius: 1.5 }),
        height: '100%',
        contentVisibility: 'auto',
        containIntrinsicSize: '360px',
        overflow: 'hidden',
        '&::before': { ...buildSelectionRailSx(Boolean(selected)) },
        ...(selected ? {
          boxShadow: (theme) => theme.palette.mode === 'light'
            ? '0 0 0 2px rgba(49,90,156,0.30) inset, 0 18px 38px rgba(49,90,156,0.14)'
            : '0 0 0 2px rgba(120,156,220,0.34) inset, 0 20px 44px rgba(0,0,0,0.36)',
        } : {}),
      }}
    >
      <Box sx={{ position: 'relative', height: '100%' }}>
        {selectionMode && selectable ? (
          <Box
            role="checkbox"
            aria-checked={Boolean(selected)}
            tabIndex={0}
            onClick={(event) => { event.stopPropagation(); handleClick(); }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); handleClick(); } }}
            sx={{ position: 'absolute', top: 6, left: 6, zIndex: 3, p: 0.35, borderRadius: 1, cursor: 'pointer', color: selected ? 'primary.main' : 'action.disabled', bgcolor: selected ? 'background.paper' : 'transparent', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 } }}
          >
            <CheckCircleIcon fontSize="small" />
          </Box>
        ) : null}
        {(onEdit || onDelete) ? (
          <IconButton
            size="small"
            aria-label={i18n.language.startsWith('zh') ? `${character.name} 的菜单` : `Menu for ${character.name}`}
            onClick={(event) => {
              event.stopPropagation();
              longPressTriggeredRef.current = false;
              setAnchorEl(event.currentTarget);
            }}
            sx={{
              position: 'absolute', top: 10, right: 10, zIndex: 2, borderRadius: 1,
              bgcolor: (theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.72)' : 'rgba(18,20,28,0.70)',
              transition: transition(['background-color', 'transform'], motion.durations.fast, motion.softOut),
              '&:hover': { bgcolor: 'action.hover', transform: 'scale(1.04)' },
            }}
          >
            <MoreIcon fontSize="small" />
          </IconButton>
        ) : null}
        <CardActionArea
          onClick={handleClick}
          onPointerDown={startLongPress}
          onPointerUp={clearPressTimer}
          onPointerLeave={() => { clearPressTimer(); longPressTriggeredRef.current = false; }}
          onPointerCancel={() => { clearPressTimer(); longPressTriggeredRef.current = false; }}
          onContextMenu={(event) => {
            if (!onLongPress) return;
            event.preventDefault();
            longPressTriggeredRef.current = true;
            onLongPress();
          }}
          disabled={!onClick && !selectable}
          sx={{ height: '100%', alignItems: 'stretch', textAlign: 'left' }}
        >
          <Box sx={{ display: 'grid', gridTemplateRows: 'auto minmax(182px, 1fr) auto', width: '100%', minHeight: 360 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.15, px: 1.5, py: 1.25, pr: (onEdit || onDelete) ? 5.5 : 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                <Avatar
                  src={isImageAvatar(character.avatar) ? resolveSafeAvatarSrc(character.avatar) : undefined}
                  slotProps={{ img: { onError: () => rememberFailedAvatarUrl(character.avatar), loading: 'lazy', decoding: 'async' } }}
                  sx={{ width: 34, height: 34, fontSize: '1rem', bgcolor: 'primary.light' }}
                >
                  {isImageAvatar(character.avatar) ? undefined : character.avatar}
                </Avatar>
                {avatarGenerating ? (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'rgba(10,15,25,0.52)', color: 'common.white' }}>
                    <CircularProgress size={18} thickness={4} color="inherit" />
                  </Box>
                ) : null}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, lineHeight: 1.25 }}>{character.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {character.group || (i18n.language.startsWith('zh') ? '未分组' : 'Ungrouped')}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ position: 'relative', aspectRatio: '1 / 1', minHeight: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
              {generatedVisualUrl || (visualImage && isImageAvatar(visualImage.url)) ? (
                <Box
                  component="img"
                  src={generatedVisualUrl || resolveSafeAvatarSrc(visualImage?.url)}
                  alt={`${character.name} ${i18n.language.startsWith('zh') ? '形象图' : 'visual identity'}`}
                  onError={() => { if (visualImage?.url) rememberFailedAvatarUrl(visualImage.url); }}
                  loading="lazy"
                  decoding="async"
                  sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: 'center' }}
                />
              ) : <VisualPlaceholder name={character.name} />}
              {visualGenerating ? (
                <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 0.75, bgcolor: 'rgba(10,15,25,0.48)', color: 'common.white', textAlign: 'center' }}>
                  <CircularProgress size={28} thickness={4} color="inherit" />
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>{i18n.language.startsWith('zh') ? '正在生成形象图' : 'Generating visual identity'}</Typography>
                </Box>
              ) : null}
            </Box>
            <Box sx={{ px: 1.5, pt: 1.25, pb: 1.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', minHeight: '4.2em', overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, lineHeight: 1.45 }}>
                {description || (i18n.language.startsWith('zh') ? '尚未填写角色介绍' : 'No character introduction yet')}
              </Typography>
              {expertise.length ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.1 }}>
                  {expertise.map((item) => <Chip key={item} label={item} size="small" variant="outlined" sx={microPillChipSx} />)}
                </Box>
              ) : null}
            </Box>
          </Box>
        </CardActionArea>
      </Box>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {onStartDirectChat && !selectionMode ? <MenuItem onClick={() => handleMenuAction(onStartDirectChat)}>{i18n.language.startsWith('zh') ? '发起单聊' : 'Start direct chat'}</MenuItem> : null}
        {onEdit ? <MenuItem onClick={() => handleMenuAction(onEdit)}>{t('common.edit')}</MenuItem> : null}
        {onDelete ? <MenuItem sx={{ color: 'error.main' }} onClick={() => handleMenuAction(onDelete)}>{t('common.delete')}</MenuItem> : null}
      </Menu>
    </Card>
  );
}
