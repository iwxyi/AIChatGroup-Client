import { memo, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardActionArea, Box, Typography, Avatar, AvatarGroup, Chip, Checkbox, CircularProgress } from '@mui/material';
import { isImageAvatar } from '../../utils/avatar';
import DirectIcon from '@mui/icons-material/ChatBubbleOutlined';
import GroupIcon from '@mui/icons-material/Groups';
import AssistantIcon from '@mui/icons-material/SmartToyOutlined';
import CheckIcon from '@mui/icons-material/Check';
import type { GroupChat } from '../../types/chat';
import type { AICharacter } from '../../types/character';
import { formatRelativeTime } from '../../utils/format';
import { buildInteractiveSurfaceSx, buildSelectionRailSx } from '../../styles/interaction';
import { buildChatSubtitle } from './chatCardSubtitle';
import { getChatGameplayShortLabel } from '../../services/chatGameplayPresentation';
import { sanitizeChatLatestMessage } from '../../services/chatLatestMessage';
import { avatarGenerationQueue, type AvatarGenerationTaskState } from '../../services/avatarGenerationQueue';

interface ChatCardProps {
  chat: GroupChat;
  characters: AICharacter[];
  onClick: () => void;
  onPrefetch?: () => void;
  selected?: boolean;
  selectable?: boolean;
  multiSelected?: boolean;
  onToggleSelection?: () => void;
  onLongPress?: () => void;
}

const CHAT_CARD_AVATAR_IMG_PROPS = {
  loading: 'lazy',
  decoding: 'async',
} as const;

function ChatCard({ chat, characters, onClick, onPrefetch, selected = false, selectable = false, multiSelected = false, onToggleSelection, onLongPress }: ChatCardProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const startLongPress = () => {
    if (!onLongPress) return;
    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
      clearLongPress();
    }, 520);
  };
  const clearLongPress = () => {
    if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const handleLongPressEnd = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
  };
  const handleContextMenu = (event: React.MouseEvent) => {
    if (!onLongPress) return;
    event.preventDefault();
    longPressTriggeredRef.current = true;
    onLongPress();
  };
  const [avatarTask, setAvatarTask] = useState<AvatarGenerationTaskState | null>(() => avatarGenerationQueue.getLatestTaskForTarget(`chat-avatar:${chat.id}`));
  useEffect(() => avatarGenerationQueue.subscribeTarget(`chat-avatar:${chat.id}`, setAvatarTask), [chat.id]);
  const resolvedLatestMessage = sanitizeChatLatestMessage(chat.latestMessage);
  const members = characters.filter((c) => chat.memberIds.includes(c.id));
  const deletedMembers = members.filter((member) => member.deletedAt != null);
  const deletedCount = deletedMembers.length;
  const deletedStatusLabel = deletedCount > 0
    ? (deletedCount >= members.length ? '已删除' : `已删除${deletedCount}`)
    : null;
  const isAssistant = chat.type === 'assistant';
  const isUserDirect = chat.type === 'direct';
  const isAiDirect = chat.type === 'ai_direct';
  const isDirect = isUserDirect || isAiDirect;
  const directMembers = isAiDirect ? members.slice(0, 2) : members.slice(0, 1);
  const directMember = isUserDirect ? directMembers[0] : null;
  const directDisplayName = directMember?.name || chat.name;
  const aiDirectDisplayName = directMembers.map((member) => member.name).join(' × ') || chat.name;
  const subtitle = buildChatSubtitle(chat, members, resolvedLatestMessage);
  const gameplayLabel = getChatGameplayShortLabel(chat);
  const directAvatarNode = isAiDirect && directMembers.length ? (
    <AvatarGroup max={2} total={directMembers.length} sx={{ flexShrink: 0, '& .MuiAvatar-root': { width: 46, height: 46, fontSize: '1.05rem', borderColor: 'background.paper' } }}>
      {directMembers.map((member) => (
      <Avatar
          key={member.id}
          src={isImageAvatar(member.avatar) ? member.avatar : undefined}
          slotProps={{ img: CHAT_CARD_AVATAR_IMG_PROPS }}
          sx={{ bgcolor: 'primary.light' }}
        >
          {isImageAvatar(member.avatar) ? undefined : member.avatar}
        </Avatar>
      ))}
    </AvatarGroup>
  ) : directMember ? (
    <Avatar
      src={isImageAvatar(directMember.avatar) ? directMember.avatar : undefined}
      slotProps={{ img: CHAT_CARD_AVATAR_IMG_PROPS }}
      sx={{ width: 46, height: 46, fontSize: '1.05rem', bgcolor: 'primary.light', flexShrink: 0 }}
    >
      {isImageAvatar(directMember.avatar) ? undefined : directMember.avatar}
    </Avatar>
  ) : (
    <Avatar sx={{ width: 46, height: 46, fontSize: '1.05rem', bgcolor: 'primary.light', flexShrink: 0 }}>
      <DirectIcon sx={{ fontSize: 18 }} />
    </Avatar>
  );
  const groupAvatarUrl = chat.type === 'group' ? chat.groupVisual?.avatarUrl?.trim() : '';
  const groupAvatarGenerating = avatarTask?.status === 'queued' || avatarTask?.status === 'running';
  const groupAvatarNode = (
    <Box sx={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
      <Avatar src={groupAvatarUrl || undefined} sx={{ width: 46, height: 46, bgcolor: 'primary.light', fontSize: '1.05rem' }}>
        <GroupIcon fontSize="small" />
      </Avatar>
      {groupAvatarGenerating ? (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: 'rgba(15,23,42,0.38)' }}>
          <CircularProgress size={19} sx={{ color: 'common.white' }} />
        </Box>
      ) : null}
    </Box>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        ...buildInteractiveSurfaceSx({ selected: selected || multiSelected }),
        height: '100%',
        overflow: 'hidden',
        '&::before': {
          ...buildSelectionRailSx(selected || multiSelected || !isDirect, isDirect ? 2 : 3),
          opacity: selected || multiSelected ? 0.9 : isDirect ? 0.22 : 0.30,
        },
      }}
    >
      {selectable ? (
        <Checkbox
          checked={multiSelected}
          onClick={(event) => { event.stopPropagation(); onToggleSelection?.(); }}
          inputProps={{ 'aria-label': `选择${chat.name}` }}
          icon={<Box sx={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(255,255,255,0.78)' }} />}
          checkedIcon={<Box sx={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText' }}><CheckIcon sx={{ fontSize: 16 }} /></Box>}
          sx={{ position: 'absolute', top: 5, left: 5, zIndex: 3, p: 0.4, borderRadius: '50%', '&:hover': { bgcolor: 'action.hover' } }}
        />
      ) : null}
      <CardActionArea
        onClick={(event) => {
          if (longPressTriggeredRef.current) {
            event.preventDefault();
            longPressTriggeredRef.current = false;
            return;
          }
          onClick();
        }}
        onPointerDown={startLongPress}
        onPointerUp={clearLongPress}
        onPointerLeave={handleLongPressEnd}
        onPointerCancel={handleLongPressEnd}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPress}
        onMouseLeave={handleLongPressEnd}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPress}
        onContextMenu={handleContextMenu}
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        onPointerDown={onPrefetch}
        sx={{
          height: '100%',
        }}
      >
        <CardContent sx={{ p: { xs: 1.75, sm: 2 }, position: 'relative', zIndex: 1, '&:last-child': { pb: { xs: 1.75, sm: 2 } } }}>
          {isDirect ? (
            <Box sx={{ minWidth: 0, position: 'relative', display: 'flex', alignItems: 'stretch', gap: 1.25 }}>
              {deletedStatusLabel ? (
                <Chip
                  size="small"
                  color="error"
                  variant="outlined"
                  label={deletedStatusLabel}
                  sx={{ position: 'absolute', top: -2, right: 0, height: 21, zIndex: 2, '& .MuiChip-label': { px: 0.7 } }}
                />
              ) : null}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ml: { xs: -0.5, sm: -0.75 } }}>
                {directAvatarNode}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mb: 0.85, pr: deletedStatusLabel ? 7 : 0 }}>
                  <Typography variant="subtitle1" noWrap sx={{ fontWeight: 760, letterSpacing: 0, minWidth: 0 }}>
                    {isAiDirect ? aiDirectDisplayName : directDisplayName}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', minWidth: 0 }}>
                    {subtitle || chat.name}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                    {formatRelativeTime(chat.lastMessageAt)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          ) : (
            <>
              {gameplayLabel || deletedStatusLabel ? (
                <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5, zIndex: 2 }}>
                  {gameplayLabel ? (
                    <Chip label={gameplayLabel} size="small" variant="filled" sx={{ height: 22, borderRadius: 1, fontSize: '0.72rem', fontWeight: 760, color: 'primary.dark', bgcolor: 'rgba(25, 118, 210, 0.10)', border: '1px solid rgba(25, 118, 210, 0.18)', '& .MuiChip-label': { px: 0.8 } }} />
                  ) : null}
                  {deletedStatusLabel ? <Chip size="small" color="error" variant="outlined" label={deletedStatusLabel} sx={{ height: 22, borderRadius: 1, '& .MuiChip-label': { px: 0.8 } }} /> : null}
                </Box>
              ) : null}
              <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1.25, minWidth: 0, pl: selectable ? 3.2 : 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', flexShrink: 0, ml: { xs: -0.5, sm: -0.75 } }}>
                  {isAssistant ? <Avatar sx={{ width: 46, height: 46, bgcolor: 'primary.light', flexShrink: 0 }}><AssistantIcon fontSize="small" /></Avatar> : groupAvatarNode}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, pr: gameplayLabel || deletedStatusLabel ? 11 : 0 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontWeight: 760, letterSpacing: 0, minWidth: 0 }}>
                      {chat.type === 'group' ? `${chat.name} (${chat.memberIds.length})` : chat.name}
                    </Typography>
                  </Box>
                  {subtitle ? <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.35 }}>{subtitle}</Typography> : null}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0, mt: 0.75 }}>
                    {isAssistant ? (
                      <Chip size="small" variant="outlined" label="客观助手" sx={{ borderRadius: 1, height: 24 }} />
                    ) : (
                      <AvatarGroup max={5} total={members.length} sx={{ '& .MuiAvatar-root': { width: 26, height: 26, fontSize: '0.78rem' } }}>
                        {members.slice(0, 5).map((member) => (
                          <Avatar
                            key={member.id}
                            src={isImageAvatar(member.avatar) ? member.avatar : undefined}
                            slotProps={{ img: CHAT_CARD_AVATAR_IMG_PROPS }}
                            sx={{ bgcolor: 'primary.light' }}
                          >
                            {isImageAvatar(member.avatar) ? undefined : member.avatar}
                          </Avatar>
                        ))}
                      </AvatarGroup>
                    )}
                    <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>{formatRelativeTime(chat.lastMessageAt)}</Typography>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default memo(ChatCard, (prev, next) => (
  prev.chat === next.chat
  && prev.characters === next.characters
  && prev.selected === next.selected
  && prev.selectable === next.selectable
  && prev.multiSelected === next.multiSelected
  && prev.onPrefetch === next.onPrefetch
  && prev.onToggleSelection === next.onToggleSelection
  && prev.onLongPress === next.onLongPress
));
