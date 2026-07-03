import type { ChipProps } from '@mui/material';
import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import { getEffectiveCharacterPresence } from './characterPresence';
import { isChatMemberMuted } from './scheduler';

export interface MemberAvailabilityChip {
  key: string;
  label: string;
  hint: string;
  color: ChipProps['color'];
  variant: ChipProps['variant'];
}

function formatRemainingTime(unavailableUntil: number | undefined, now: number, isZh: boolean) {
  if (!unavailableUntil || unavailableUntil <= now) return '';
  const remainingMinutes = Math.max(1, Math.ceil((unavailableUntil - now) / 60_000));
  if (remainingMinutes >= 60) {
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return isZh
      ? `${hours}小时${minutes ? `${minutes}分钟` : ''}`
      : `${hours}h${minutes ? ` ${minutes}m` : ''}`;
  }
  return isZh ? `${remainingMinutes}分钟` : `${remainingMinutes}m`;
}

export function buildMemberAvailabilityChips(params: {
  member: AICharacter;
  chat?: GroupChat | null;
  now?: number;
  language?: string;
}): MemberAvailabilityChip[] {
  const isZh = (params.language || 'zh').startsWith('zh');
  const now = typeof params.now === 'number' && Number.isFinite(params.now) ? params.now : Date.now();
  const chips: MemberAvailabilityChip[] = [];
  const presence = getEffectiveCharacterPresence(params.member, now);
  const isUserMember = params.member.id === 'user';
  if (!isUserMember && params.member.deletedAt) {
    chips.push({
      key: 'deleted',
      label: isZh ? '已删除' : 'Deleted',
      hint: isZh ? '该角色已删除，不会参与自动调度发言。' : 'This character is deleted and will not be scheduled.',
      color: 'error',
      variant: 'outlined',
    });
  }
  if (params.chat && isChatMemberMuted(params.chat, params.member.id)) {
    chips.push({
      key: 'muted',
      label: isZh ? '禁言' : 'Muted',
      hint: isZh ? '该成员当前被禁言，不会被自动调度发言。' : 'This member is muted and will not be scheduled.',
      color: 'warning',
      variant: 'outlined',
    });
  }
  if (presence.status === 'away') {
    const activity = presence.activity || (isZh ? '暂离' : 'Away');
    const remaining = formatRemainingTime(presence.unavailableUntil, now, isZh);
    chips.push({
      key: 'away',
      label: isZh ? `暂离：${activity}` : `Away: ${activity}`,
      hint: [
        isZh ? '该角色当前暂时不在线，不会参与自动调度。' : 'This character is temporarily unavailable and will not be scheduled.',
        presence.reason ? (isZh ? `原因：${presence.reason}` : `Reason: ${presence.reason}`) : '',
        remaining ? (isZh ? `预计 ${remaining} 后恢复。` : `Expected back in ${remaining}.`) : '',
      ].filter(Boolean).join(' '),
      color: 'default',
      variant: 'outlined',
    });
  }
  return chips;
}
