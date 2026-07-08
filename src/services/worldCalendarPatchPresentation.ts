import type { RuntimeEventV2 } from '../types/runtimeEvent';
import { sanitizeUserFacingText, type DisplayTextMember } from './displayTextSanitizer';

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatPatchStartAt(startAt: number | null, isZh: boolean) {
  if (typeof startAt !== 'number') return '';
  const label = isZh ? '开始' : 'Start';
  return `${label} ${new Date(startAt).toLocaleString()}`;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readStringRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatParticipantState(state: string, isZh: boolean) {
  if (!isZh) return state;
  const labels: Record<string, string> = {
    mentioned: '被提及',
    invited: '已邀约',
    interested: '有兴趣',
    maybe: '待定',
    going: '参加',
    late: '迟到',
    left_early: '早退',
    declined: '拒绝',
    withdrawn: '退出',
    no_show: '未出现',
    cancelled_by_dependency: '受取消影响',
  };
  return labels[state] || state;
}

function formatParticipantPatch(value: unknown, isZh: boolean, members: DisplayTextMember[]) {
  const states = readStringRecord(value);
  return Object.entries(states)
    .map(([id, state]) => {
      if (typeof state !== 'string') return '';
      const name = members.find((member) => member.id === id)?.name || id;
      return `${name}:${formatParticipantState(state, isZh)}`;
    })
    .filter(Boolean)
    .join('、');
}

export function isAutoCalendarPatchEvent(event: RuntimeEventV2) {
  if (event.kind !== 'calendar_item_patch') return false;
  const payload = event.payload as Record<string, unknown>;
  return readString(payload.source) === 'world_calendar_patch_executor';
}

export function buildCalendarPatchTimelineTitle(event: RuntimeEventV2, isZh: boolean) {
  const payload = event.payload as Record<string, unknown>;
  if (readString(payload.source) === 'chat_activity_followup') {
    return isZh ? '活动候选更新' : 'Activity candidate patch';
  }
  return isAutoCalendarPatchEvent(event)
    ? (isZh ? '日历冲突自动修正' : 'Calendar auto-fix')
    : (isZh ? '日历更新' : 'Calendar patch');
}

export function buildCalendarPatchSummary(event: RuntimeEventV2, isZh: boolean, members: DisplayTextMember[] = []) {
  const payload = event.payload as Record<string, unknown>;
  const startAt = readNumber(payload.startAt);
  const source = readString(payload.source);
  const timeHint = readString(payload.timeHint);
  const locationHint = readString(payload.locationHint);
  const status = readString(payload.status);
  const participantPatch = formatParticipantPatch(payload.addParticipantStates, isZh, members);
  const added = readStringArray(payload.addParticipantIds).length;
  const removed = readStringArray(payload.removeParticipantIds).length;
  const reason = sanitizeUserFacingText(readString(payload.reason) || readString(payload.summary) || readString(event.summary), members);
  const mode = source === 'chat_activity_followup'
    ? (isZh ? '聊天更新活动候选' : 'Chat activity update')
    : isAutoCalendarPatchEvent(event)
      ? (isZh ? '自动冲突修正' : 'Auto conflict fix')
      : (isZh ? '日历更新' : 'Calendar update');
  const parts = [
    mode,
    formatPatchStartAt(startAt, isZh),
    timeHint ? (isZh ? `时间 ${timeHint}` : `Time ${timeHint}`) : '',
    locationHint ? (isZh ? `地点 ${locationHint}` : `Location ${locationHint}`) : '',
    status ? (isZh ? `状态 ${status}` : `Status ${status}`) : '',
    participantPatch ? (isZh ? `参与 ${participantPatch}` : `Participants ${participantPatch}`) : '',
    added && !participantPatch ? (isZh ? `新增参与者 ${added}` : `Added ${added}`) : '',
    removed ? (isZh ? `移除参与者 ${removed}` : `Removed ${removed}`) : '',
    reason ? (isZh ? `说明 ${reason}` : `Reason ${reason}`) : '',
  ].filter(Boolean);
  return parts.join(' · ') || mode;
}

export function buildCalendarPatchDebugChips(event: RuntimeEventV2, isZh: boolean) {
  const payload = event.payload as Record<string, unknown>;
  const hasStartPatch = typeof readNumber(payload.startAt) === 'number';
  const hasEndPatch = typeof readNumber(payload.endAt) === 'number';
  const hasParticipantPatch = Boolean(readString(payload.participantState) || readString(payload.participantId))
    || Array.isArray(payload.addParticipantIds)
    || Array.isArray(payload.removeParticipantIds)
    || Object.keys(readStringRecord(payload.addParticipantStates)).length > 0;
  return [
    readString(payload.source) === 'chat_activity_followup' ? (isZh ? '聊天修订' : 'Chat') : '',
    isAutoCalendarPatchEvent(event) ? (isZh ? '自动修正' : 'Auto') : (isZh ? '手动修正' : 'Manual'),
    hasStartPatch ? (isZh ? '开始时间' : 'Start time') : '',
    readString(payload.timeHint) ? (isZh ? '自然时间' : 'Time hint') : '',
    readString(payload.locationHint) ? (isZh ? '地点' : 'Location') : '',
    hasEndPatch ? (isZh ? '结束时间' : 'End time') : '',
    hasParticipantPatch ? (isZh ? '参与者' : 'Participants') : '',
  ].filter(Boolean);
}
