import { memo } from 'react';
import { Card, CardContent, CardActionArea, Box, Typography, Avatar, AvatarGroup, Chip } from '@mui/material';
import { isImageAvatar } from '../../utils/avatar';
import DirectIcon from '@mui/icons-material/ChatBubbleOutlined';
import GroupIcon from '@mui/icons-material/Groups';
import AssistantIcon from '@mui/icons-material/SmartToyOutlined';
import type { GroupChat } from '../../types/chat';
import type { AICharacter } from '../../types/character';
import { formatRelativeTime } from '../../utils/format';
import { buildInteractiveSurfaceSx, buildSelectionRailSx } from '../../styles/interaction';
import { buildChatSubtitle } from './chatCardSubtitle';
import { getChatGameplayShortLabel } from '../../services/chatGameplayPresentation';
import { sanitizeChatLatestMessage } from '../../services/chatLatestMessage';

interface ChatCardProps {
  chat: GroupChat;
  characters: AICharacter[];
  onClick: () => void;
  onPrefetch?: () => void;
  selected?: boolean;
}

const CHAT_CARD_AVATAR_IMG_PROPS = {
  loading: 'lazy',
  decoding: 'async',
} as const;

function ChatCard({ chat, characters, onClick, onPrefetch, selected = false }: ChatCardProps) {
  const resolvedLatestMessage = sanitizeChatLatestMessage(chat.latestMessage);
  const members = characters.filter((c) => chat.memberIds.includes(c.id));
  const isAssistant = chat.type === 'assistant';
  const isUserDirect = chat.type === 'direct';
  const isAiDirect = chat.type === 'ai_direct';
  const isDirect = isUserDirect || isAiDirect;
  const directMembers = isAiDirect ? members.slice(0, 2) : members.slice(0, 1);
  const visibleAvatarMembers = isDirect ? directMembers : members.slice(0, 5);
  const directMember = isUserDirect ? directMembers[0] : null;
  const directDisplayName = directMember?.name || chat.name;
  const aiDirectDisplayName = directMembers.map((member) => member.name).join(' × ') || chat.name;
  const subtitle = buildChatSubtitle(chat, members, resolvedLatestMessage);
  const gameplayLabel = getChatGameplayShortLabel(chat);
  const directAvatarNode = isAiDirect && directMembers.length ? (
    <AvatarGroup max={2} total={directMembers.length} sx={{ flexShrink: 0, '& .MuiAvatar-root': { width: 34, height: 34, fontSize: '0.92rem', borderColor: 'background.paper' } }}>
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
      sx={{ width: 34, height: 34, fontSize: '0.92rem', bgcolor: 'primary.light', flexShrink: 0 }}
    >
      {isImageAvatar(directMember.avatar) ? undefined : directMember.avatar}
    </Avatar>
  ) : (
    <Avatar sx={{ width: 34, height: 34, fontSize: '0.92rem', bgcolor: 'primary.light', flexShrink: 0 }}>
      <DirectIcon sx={{ fontSize: 18 }} />
    </Avatar>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        ...buildInteractiveSurfaceSx({ selected }),
        height: '100%',
        overflow: 'hidden',
        '&::before': {
          ...buildSelectionRailSx(selected || !isDirect, isDirect ? 2 : 3),
          opacity: selected ? 0.9 : isDirect ? 0.22 : 0.30,
        },
      }}
    >
      <CardActionArea
        onClick={onClick}
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        onPointerDown={onPrefetch}
        sx={{
          height: '100%',
        }}
      >
        <CardContent sx={{ p: { xs: 1.75, sm: 2 }, position: 'relative', zIndex: 1, '&:last-child': { pb: { xs: 1.75, sm: 2 } } }}>
          {isDirect ? (
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mb: 0.85 }}>
                {directAvatarNode}
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
          ) : (
            <>
              {gameplayLabel ? (
                <Chip
                  label={gameplayLabel}
                  size="small"
                  variant="filled"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    height: 22,
                    borderRadius: 1,
                    fontSize: '0.72rem',
                    fontWeight: 760,
                    color: 'primary.dark',
                    bgcolor: 'rgba(25, 118, 210, 0.10)',
                    border: '1px solid rgba(25, 118, 210, 0.18)',
                    zIndex: 2,
                    '& .MuiChip-label': { px: 0.8 },
                  }}
                />
              ) : null}
              <Box sx={{ mb: 1, minWidth: 0, pr: gameplayLabel ? 5.5 : 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  {isAssistant ? <AssistantIcon sx={{ fontSize: 16, color: 'text.secondary' }} /> : <GroupIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
                  <Typography variant="subtitle1" noWrap sx={{ fontWeight: 760, letterSpacing: 0 }}>
                    {chat.type === 'group' ? `${chat.name} (${chat.memberIds.length})` : chat.name}
                  </Typography>
                </Box>
                {subtitle ? (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.35 }}>
                    {subtitle}
                  </Typography>
                ) : null}
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {isAssistant ? (
                  <Chip size="small" variant="outlined" label="客观助手" sx={{ borderRadius: 1 }} />
                ) : (
                  <AvatarGroup max={5} total={members.length} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: '0.85rem' } }}>
                    {visibleAvatarMembers.map((m) => (
                      <Avatar
                        key={m.id}
                        src={isImageAvatar(m.avatar) ? m.avatar : undefined}
                        slotProps={{ img: CHAT_CARD_AVATAR_IMG_PROPS }}
                        sx={{ bgcolor: 'primary.light' }}
                      >
                        {isImageAvatar(m.avatar) ? undefined : m.avatar}
                      </Avatar>
                    ))}
                  </AvatarGroup>
                )}
                <Typography variant="caption" color="text.disabled">
                  {formatRelativeTime(chat.lastMessageAt)}
                </Typography>
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
  && prev.onPrefetch === next.onPrefetch
));
