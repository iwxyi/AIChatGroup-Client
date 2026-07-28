import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { RuntimeEventV2 } from '../types/runtimeEvent';
import type { CareTopicHistoryEntry, CompanionshipPhase, CompanionshipRuntimeTrace, CompanionshipStyle, IntimateConflictHistoryEntry, PendingCareTopic, PendingPromise, PhaseHistoryEntry, PromiseHistoryEntry, RitualHistoryEntry, RitualRegistryEntry, SharedAnchorHistoryEntry, SharedMemoryAnchor, SharedPhrase, SharedPhraseHistoryEntry, SharedSecret, SharedSecretHistoryEntry, UserAttachmentProfile, UserProfileMemoryEventItem, UserProfileMemoryHistoryEntry, UserProfileMemoryKind } from '../types/companionship';
import { sanitizeUserFacingText } from './displayTextSanitizer';
import { safeRuntimePrivateText } from './runtimePrivateTextPrivacy';

export type ManualPromiseLifecycleAction = Extract<PendingPromise['status'], 'fulfilled' | 'blocked' | 'stale' | 'revoked'>;
export type ManualAddressingSetAction = 'set_current' | 'set_private' | 'set_public';
export type PromiseMergeTarget = 'previous' | 'next';
function clipRuntimeText(text: string, max = 72) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function formatRuntimeEvidence(items: string[], fallback = '有一条私域证据已隐藏原文') {
  return items.map((item) => safeRuntimePrivateText(item, fallback)).filter(Boolean).join(' / ');
}

function buildManualCompanionshipEventId(parts: Array<string | number | undefined>) {
  const now = Date.now();
  const source = parts.filter((item) => item !== undefined && item !== null && String(item).length > 0).join('|');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `evt_${now}_${hash.toString(36)}`;
}

function buildManualCareTopicBlockedEvent(chat: GroupChat, character: AICharacter, topic: PendingCareTopic): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, topic.id, 'care-blocked']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户关闭了一个关心事项提醒`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_care_topic',
      characterId: character.id,
      userId: 'user',
      topicId: topic.id,
      topicText: topic.text,
      action: 'blocked',
      urgency: topic.urgency,
      reason: '用户在角色关系页手动关闭该关心事项。',
      evidence: 'manual_close_from_character_relationship_tab',
      sourceMessageIds: topic.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualCareTopicRestoreEvent(chat: GroupChat, character: AICharacter, item: CareTopicHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, item.topicId, 'care-topic-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户从历史中恢复了一个关心事项`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_care_topic',
      characterId: character.id,
      userId: 'user',
      topicId: item.topicId,
      topicText: item.topicText,
      action: 'opened',
      urgency: item.urgency,
      reason: `用户在开发者诊断中从关心历史 ${item.id} 恢复追踪。`,
      evidence: ['manual_restore_from_care_topic_history', ...item.evidence].filter(Boolean).join(' / '),
      sourceMessageIds: item.sourceMessageIds,
      dueAt: item.dueAt,
      confidence: 1,
    },
  };
}

function formatManualPromiseLifecycleAction(action: ManualPromiseLifecycleAction) {
  const labels: Record<ManualPromiseLifecycleAction, string> = {
    fulfilled: '已完成',
    stale: '已落空',
    blocked: '不再提醒',
    revoked: '关闭追踪',
  };
  return labels[action];
}

function getManualPromiseLifecycleReason(action: ManualPromiseLifecycleAction) {
  const reasons: Record<ManualPromiseLifecycleAction, string> = {
    fulfilled: '用户在角色关系页标记该约定已经完成。',
    stale: '用户在角色关系页标记该约定已经落空或过期。',
    blocked: '用户在角色关系页标记该约定不用再提醒或已阻断。',
    revoked: '用户在角色关系页手动关闭该约定追踪。',
  };
  return reasons[action];
}

function buildManualPromiseLifecycleEvent(chat: GroupChat, character: AICharacter, promise: PendingPromise, action: ManualPromiseLifecycleAction): RuntimeEventV2 {
  const now = Date.now();
  const label = formatManualPromiseLifecycleAction(action);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, promise.id, `promise-${action}`]),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户将一个约定标记为${label}`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_promise',
      characterId: character.id,
      userId: 'user',
      promiseId: promise.id,
      promiseText: promise.text,
      action,
      participantIds: promise.participantIds?.length ? promise.participantIds : [character.id, 'user'],
      promiseKind: promise.kind,
      reminderPolicy: promise.reminderPolicy,
      relationshipEffects: promise.relationshipEffects,
      lifecycleEvidence: [...(promise.lifecycleEvidence || []), `manual_${action}_from_character_relationship_tab`],
      sourceMessageIds: promise.sourceMessageIds,
      dueAt: promise.dueAt,
      reason: getManualPromiseLifecycleReason(action),
      evidence: `manual_${action}_from_character_relationship_tab`,
      confidence: 1,
    },
  };
}

function buildManualPromiseUpsertEvent(chat: GroupChat, character: AICharacter, promise: PendingPromise, patch: { text: string; kind: PendingPromise['kind'] }): RuntimeEventV2 {
  const now = Date.now();
  const normalizedText = clipRuntimeText(patch.text, 140);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, promise.id, normalizedText, patch.kind, 'promise-opened']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户修正了一个未完成约定`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_promise',
      characterId: character.id,
      userId: 'user',
      promiseId: promise.id,
      promiseText: normalizedText,
      supersedesText: promise.text,
      action: 'opened',
      participantIds: promise.participantIds?.length ? promise.participantIds : [character.id, 'user'],
      promiseKind: patch.kind,
      reminderPolicy: promise.reminderPolicy,
      relationshipEffects: promise.relationshipEffects,
      lifecycleEvidence: [...(promise.lifecycleEvidence || []), 'manual_upsert_from_character_relationship_tab'],
      sourceMessageIds: promise.sourceMessageIds,
      dueAt: promise.dueAt,
      reason: '用户在角色关系页手动修正该未完成约定。',
      evidence: 'manual_upsert_from_character_relationship_tab',
      confidence: 1,
    },
  };
}

function buildManualPromiseMergeEvents(chat: GroupChat, character: AICharacter, kept: PendingPromise, merged: PendingPromise): RuntimeEventV2[] {
  const mergedText = kept.text.includes(merged.text)
    ? kept.text
    : `${kept.text}；${merged.text}`;
  return [
    buildManualPromiseUpsertEvent(chat, character, kept, {
      text: mergedText,
      kind: kept.kind === 'other' ? merged.kind : kept.kind,
    }),
    buildManualPromiseLifecycleEvent(chat, character, merged, 'revoked'),
  ];
}

function buildManualPromiseRestoreEvent(chat: GroupChat, character: AICharacter, item: PromiseHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const participantIds = item.participantIds.length ? item.participantIds : [character.id, 'user'];
  const includesUser = participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, item.promiseId, 'promise-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: participantIds,
    summary: `${character.name} 记录用户从历史中恢复了一个未完成约定`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: participantIds,
    payload: {
      eventType: 'companionship_promise',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      promiseId: item.promiseId,
      promiseText: item.promiseText,
      action: 'opened',
      participantIds,
      promiseKind: item.promiseKind,
      supersedesText: item.supersedesText,
      lifecycleEvidence: ['manual_restore_from_promise_history', ...item.lifecycleEvidence, ...item.evidence].filter(Boolean),
      reason: `用户在开发者诊断中从约定历史 ${item.id} 恢复追踪。`,
      evidence: ['manual_restore_from_promise_history', ...item.evidence].filter(Boolean).join(' / '),
      sourceMessageIds: item.sourceMessageIds,
      dueAt: item.dueAt,
      confidence: 1,
    },
  };
}

function buildManualAddressingEvent(chat: GroupChat, character: AICharacter, action: 'forbid' | 'unforbid', address: string): RuntimeEventV2 {
  const now = Date.now();
  const normalized = address.replace(/\s+/g, '').trim();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, normalized, `addressing-${action}`]),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: action === 'forbid'
      ? `${character.name} 记录用户禁用了一个称呼`
      : `${character.name} 记录用户恢复了一个称呼`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_addressing',
      characterId: character.id,
      userId: 'user',
      action,
      currentAddress: normalized,
      forbiddenAddresses: [normalized],
      reason: action === 'forbid'
        ? '用户在角色关系页手动禁用该称呼。'
        : '用户在角色关系页手动解除禁用该称呼。',
      evidence: 'manual_addressing_update_from_character_relationship_tab',
      initiatedBy: 'user',
      confidence: 1,
    },
  };
}

function buildManualAddressingSetEvent(chat: GroupChat, character: AICharacter, action: ManualAddressingSetAction, address: string): RuntimeEventV2 {
  const now = Date.now();
  const normalized = address.replace(/\s+/g, '').trim();
  const field = action === 'set_current'
    ? { currentAddress: normalized }
    : action === 'set_private'
      ? { privateAddress: normalized }
      : { publicAddress: normalized };
  const label = action === 'set_current' ? '当前称呼' : action === 'set_private' ? '私下称呼' : '公开称呼';
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, normalized, `addressing-${action}`]),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户设置了${label}`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_addressing',
      characterId: character.id,
      userId: 'user',
      action,
      ...field,
      reason: `用户在角色关系页手动设置${label}。`,
      evidence: 'manual_addressing_set_from_character_relationship_tab',
      initiatedBy: 'user',
      confidence: 1,
    },
  };
}

function buildManualIntimateConflictResolvedEvent(chat: GroupChat, character: AICharacter, conflict: NonNullable<CompanionshipRuntimeTrace['intimateConflict']>): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, conflict.kind, 'intimate-conflict-resolved']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户标记亲密冲突已修复`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_intimate_conflict',
      characterId: character.id,
      userId: 'user',
      action: 'resolved',
      kind: 'reconciliation',
      severity: Math.min(24, Math.max(8, Math.round(conflict.severity * 0.25))),
      repairReadiness: Math.max(82, conflict.repairReadiness),
      summary: '用户已标记这段冲突或误会完成修复，后续表达应保留温和余波，但不要继续翻旧账。',
      evidence: ['manual_resolve_from_character_relationship_tab', conflict.summary],
      participantIds: [character.id, 'user'],
      sourceMessageIds: conflict.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualIntimateConflictDismissedEvent(chat: GroupChat, character: AICharacter, conflict: NonNullable<CompanionshipRuntimeTrace['intimateConflict']>): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, conflict.kind, 'intimate-conflict-dismissed']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户撤回了一次亲密冲突判断`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_intimate_conflict',
      characterId: character.id,
      userId: 'user',
      action: 'dismissed',
      kind: conflict.kind,
      severity: 0,
      repairReadiness: 0,
      summary: '用户标记这不是一次亲密冲突，后续不要因为这条误判继续克制或翻旧账。',
      evidence: ['manual_dismiss_from_character_relationship_tab', conflict.summary],
      participantIds: [character.id, 'user'],
      sourceMessageIds: conflict.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualIntimateConflictRestoreEvent(chat: GroupChat, character: AICharacter, item: IntimateConflictHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const restoredKind = item.action === 'resolved' && item.kind !== 'reconciliation' ? 'reconciliation' : item.kind;
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, restoredKind, 'intimate-conflict-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户从历史中恢复了一次亲密冲突判断`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_intimate_conflict',
      characterId: character.id,
      userId: 'user',
      action: 'reopened',
      kind: restoredKind,
      severity: item.severity,
      repairReadiness: item.repairReadiness,
      summary: item.summary,
      evidence: ['manual_restore_from_conflict_history', ...item.evidence],
      participantIds: [character.id, 'user'],
      sourceEventIds: Array.from(new Set([item.id, ...item.sourceEventIds])),
      sourceMessageIds: item.sourceMessageIds,
      confidence: 1,
    },
  };
}

function formatAttachmentStyleLabel(style: UserAttachmentProfile['inferredStyle']) {
  const labels: Record<UserAttachmentProfile['inferredStyle'], string> = {
    secure: '稳定',
    anxious: '需要确认',
    avoidant: '需要空间',
    disorganized: '忽近忽远',
  };
  return labels[style];
}

function formatAttachmentActionLabel(action: 'inferred' | 'corrected' | 'disabled' | 'enabled') {
  const labels: Record<typeof action, string> = {
    inferred: '模型/系统推断',
    corrected: '手动修正',
    disabled: '关闭适配',
    enabled: '恢复适配',
  };
  return labels[action] || action;
}

function formatIntimateConflictActionLabel(action: 'opened' | 'updated' | 'repair_attempted' | 'resolved' | 'reopened' | 'dismissed') {
  const labels: Record<typeof action, string> = {
    opened: '开启',
    updated: '更新',
    repair_attempted: '尝试修复',
    resolved: '已修复',
    reopened: '重新打开',
    dismissed: '误判撤回',
  };
  return labels[action] || action;
}

function formatUserProfileMemoryActionLabel(action: 'upsert' | 'revoke') {
  return action === 'revoke' ? '撤回' : '写入/修正';
}

function formatAddressingActionLabel(action: 'update' | 'set_current' | 'set_private' | 'set_public' | 'forbid' | 'unforbid' | 'revoke') {
  const labels: Record<typeof action, string> = {
    update: '更新称呼',
    set_current: '设置当前称呼',
    set_private: '设置私下称呼',
    set_public: '设置公开称呼',
    forbid: '禁用称呼',
    unforbid: '解除禁用',
    revoke: '撤回称呼',
  };
  return labels[action] || action;
}

function formatCareTopicActionLabel(action: 'opened' | 'closed' | 'blocked' | 'stale') {
  const labels: Record<typeof action, string> = {
    opened: '打开',
    closed: '已结束',
    blocked: '关闭追踪',
    stale: '过期',
  };
  return labels[action] || action;
}

function formatPromiseActionLabel(action: 'opened' | 'fulfilled' | 'blocked' | 'stale' | 'revoked') {
  const labels: Record<typeof action, string> = {
    opened: '打开/修正',
    fulfilled: '已完成',
    blocked: '落空/不提醒',
    stale: '过期',
    revoked: '关闭追踪',
  };
  return labels[action] || action;
}

function formatRitualActionLabel(action: 'performed' | 'suppressed' | 'skipped' | 'restored' | 'updated') {
  const labels: Record<typeof action, string> = {
    performed: '已执行',
    suppressed: '已停用',
    skipped: '已跳过',
    restored: '已恢复',
    updated: '已更新',
  };
  return labels[action] || action;
}

const INTERACTION_PACE_OPTIONS: Array<{
  label: string;
  description: string;
  style: UserAttachmentProfile['inferredStyle'];
}> = [
  {
    label: '保持稳定',
    description: '正常来回，不额外追问，也不刻意疏远。',
    style: 'secure',
  },
  {
    label: '多给确认',
    description: '表达更明确，少让重要的话悬着。',
    style: 'anxious',
  },
  {
    label: '给我空间',
    description: '降低主动和想念表达，关心也更轻。',
    style: 'avoidant',
  },
  {
    label: '忽近忽远也稳住',
    description: '靠近和退开都接住，不跟着情绪升级。',
    style: 'disorganized',
  },
];

function formatCompanionshipPhaseLabel(phase: CompanionshipRuntimeTrace['phase']) {
  const labels: Record<CompanionshipRuntimeTrace['phase'], string> = {
    stranger: '陌生',
    curious: '好奇',
    fond: '好感',
    ambiguous: '暧昧',
    confessing: '确认前',
    confirmed: '已确认',
    passionate: '热恋',
    deep: '深层陪伴',
    cooling: '降温',
    crisis: '危机',
    reconciling: '修复中',
  };
  return labels[phase] || phase;
}

function formatInteractionPacePreferenceLabel(style: UserAttachmentProfile['inferredStyle']) {
  return INTERACTION_PACE_OPTIONS.find((option) => option.style === style)?.label || formatAttachmentStyleLabel(style);
}

function buildManualAttachmentProfileEvent(
  chat: GroupChat,
  character: AICharacter,
  action: 'disabled' | 'enabled' | 'corrected',
  style?: UserAttachmentProfile['inferredStyle'],
  reasonOverride?: string,
): RuntimeEventV2 {
  const now = Date.now();
  const correctedStyle = action === 'corrected' ? style || 'secure' : undefined;
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, `attachment-${action}`, correctedStyle || '']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: action === 'corrected'
      ? `${character.name} 记录用户修正了依恋适配`
      : action === 'disabled'
      ? `${character.name} 记录用户关闭了依恋适配`
      : `${character.name} 记录用户恢复了依恋适配`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_attachment_profile',
      characterId: character.id,
      userId: 'user',
      action,
      inferredStyle: correctedStyle,
      confidence: 1,
      reason: reasonOverride || (action === 'corrected'
        ? `用户在角色关系页手动设置互动节奏偏好为${correctedStyle ? formatInteractionPacePreferenceLabel(correctedStyle) : '保持稳定'}。`
        : action === 'disabled'
          ? '用户在角色关系页手动关闭互动节奏适配。'
          : '用户在角色关系页手动恢复自动互动节奏适配。'),
      evidence: [`manual_attachment_${action}_from_character_relationship_tab`],
    },
  };
}

function buildManualUserProfileMemoryRevokeEvent(chat: GroupChat, character: AICharacter, item: UserProfileMemoryEventItem): RuntimeEventV2 {
  const now = Date.now();
  const normalized = clipRuntimeText(item.text, 140);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.kind, normalized, 'user-profile-revoke']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户撤回了一条画像线索`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_user_profile_memory',
      characterId: character.id,
      userId: 'user',
      action: 'revoke',
      items: [{
        kind: item.kind,
        text: normalized,
        evidence: item.evidence || 'manual_revoke_from_character_relationship_tab',
        sourceMessageIds: item.sourceMessageIds,
        confidence: 1,
        sensitive: item.sensitive,
      }],
      reason: '用户在角色关系页手动撤回该画像线索。',
      evidence: 'manual_revoke_from_character_relationship_tab',
      sourceMessageIds: item.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualUserProfileMemoryUpsertEvent(chat: GroupChat, character: AICharacter, item: UserProfileMemoryEventItem): RuntimeEventV2 {
  const now = Date.now();
  const normalized = clipRuntimeText(item.text, 140);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.kind, normalized, 'user-profile-upsert']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户修正了一条画像线索`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_user_profile_memory',
      characterId: character.id,
      userId: 'user',
      action: 'upsert',
      items: [{
        kind: item.kind,
        text: normalized,
        evidence: item.evidence || 'manual_upsert_from_character_relationship_tab',
        sourceMessageIds: item.sourceMessageIds,
        confidence: 1,
        sensitive: item.sensitive,
      }],
      reason: '用户在角色关系页手动修正该画像线索。',
      evidence: 'manual_upsert_from_character_relationship_tab',
      sourceMessageIds: item.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualUserProfileMemoryRestoreEvent(chat: GroupChat, character: AICharacter, item: UserProfileMemoryHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const items = item.items
    .map((profileItem) => ({
      kind: profileItem.kind,
      text: clipRuntimeText(profileItem.text, 140),
      evidence: profileItem.evidence || item.evidence[0] || 'manual_restore_from_user_profile_history',
      sourceMessageIds: profileItem.sourceMessageIds?.length ? profileItem.sourceMessageIds : item.sourceMessageIds,
      confidence: 1,
      sensitive: profileItem.sensitive,
    }))
    .filter((profileItem) => profileItem.text);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, 'user-profile-history-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户从画像历史中恢复了线索`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_user_profile_memory',
      characterId: character.id,
      userId: 'user',
      action: 'upsert',
      items,
      reason: `用户在开发者诊断中从画像历史 ${item.id} 恢复线索。`,
      evidence: ['manual_restore_from_user_profile_history', ...item.evidence].filter(Boolean).join(' / '),
      sourceMessageIds: item.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualSharedAnchorArchiveEvent(chat: GroupChat, character: AICharacter, anchor: SharedMemoryAnchor): RuntimeEventV2 {
  const now = Date.now();
  const includesUser = anchor.participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, anchor.id, 'shared-anchor-archive']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: anchor.participantIds,
    summary: `${character.name} 记录用户归档了一条共同锚点`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: anchor.participantIds,
    payload: {
      eventType: 'companionship_shared_anchor',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      anchorId: anchor.id,
      action: 'archive',
      kind: anchor.kind,
      participantIds: anchor.participantIds,
      title: anchor.title,
      text: anchor.text,
      evidence: anchor.evidence || anchor.text,
      sourceMessageIds: anchor.sourceMessageIds,
      confidence: 1,
      reason: '用户在角色关系页手动归档该共同锚点。',
    },
  };
}

function buildManualSharedAnchorUpsertEvent(chat: GroupChat, character: AICharacter, anchor: SharedMemoryAnchor, patch: { kind: SharedMemoryAnchor['kind']; title: string; text: string; participantIds?: string[] }): RuntimeEventV2 {
  const now = Date.now();
  const title = patch.title.trim();
  const text = patch.text.trim();
  const participantIds = patch.participantIds?.length ? patch.participantIds : anchor.participantIds;
  const includesUser = participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, anchor.id, title, text, participantIds.join(','), 'shared-anchor-upsert']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: participantIds,
    summary: `${character.name} 记录用户修正了一条共同锚点`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: participantIds,
    payload: {
      eventType: 'companionship_shared_anchor',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      anchorId: anchor.id,
      action: 'upsert',
      kind: patch.kind,
      participantIds,
      title,
      text,
      salience: anchor.salience,
      evidence: `manual_shared_anchor_edit_from_character_relationship_tab: ${anchor.title} / ${anchor.text}`,
      sourceMessageIds: anchor.sourceMessageIds,
      confidence: 1,
      reason: '用户在角色关系页手动修正该共同锚点。',
    },
  };
}

function buildManualSharedAnchorPairPrivateEvent(chat: GroupChat, character: AICharacter, anchor: SharedMemoryAnchor): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, anchor.id, 'shared-anchor-pair-private']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户收窄了一条共同锚点参与者`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_shared_anchor',
      characterId: character.id,
      userId: 'user',
      anchorId: anchor.id,
      action: 'upsert',
      kind: anchor.kind,
      participantIds: [character.id, 'user'],
      title: anchor.title,
      text: anchor.text,
      salience: anchor.salience,
      evidence: `manual_shared_anchor_participants_pair_private_from_character_relationship_tab: ${anchor.participantIds.join(',')}`,
      sourceMessageIds: anchor.sourceMessageIds,
      confidence: 1,
      reason: '用户在角色关系页手动把共同锚点参与者收窄为自己和该角色。',
    },
  };
}

function buildManualSharedAnchorParticipantsEvent(chat: GroupChat, character: AICharacter, anchor: SharedMemoryAnchor, participantIds: string[]): RuntimeEventV2 {
  return buildManualSharedAnchorUpsertEvent(chat, character, anchor, {
    kind: anchor.kind,
    title: anchor.title,
    text: anchor.text,
    participantIds: Array.from(new Set(participantIds.filter(Boolean))).slice(0, 6),
  });
}

function buildManualSharedAnchorRestoreEvent(chat: GroupChat, character: AICharacter, item: SharedAnchorHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const participantIds = item.participantIds.length ? item.participantIds : [character.id, 'user'];
  const includesUser = participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, item.anchorId, 'shared-anchor-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: participantIds,
    summary: `${character.name} 记录用户从历史中恢复了一条共同锚点`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: participantIds,
    payload: {
      eventType: 'companionship_shared_anchor',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      anchorId: item.anchorId,
      action: 'upsert',
      kind: item.kind,
      participantIds,
      title: item.title,
      text: item.text,
      salience: item.salience,
      evidence: ['manual_restore_from_shared_anchor_history', ...item.evidence].filter(Boolean).join(' / '),
      mergedAnchorIds: item.mergedAnchorIds,
      sourceMessageIds: item.sourceMessageIds,
      confidence: 1,
      reason: `用户在开发者诊断中从共同锚点历史 ${item.id} 恢复。`,
    },
  };
}

function buildManualSharedSecretRevokedEvent(chat: GroupChat, character: AICharacter, secret: SharedSecret): RuntimeEventV2 {
  const now = Date.now();
  const includesUser = secret.participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, secret.id, 'shared-secret-revoked']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: secret.participantIds,
    summary: `${character.name} 记录用户撤回了一条小秘密`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: secret.participantIds,
    payload: {
      eventType: 'companionship_shared_secret',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      secretId: secret.id,
      action: 'revoked',
      participantIds: secret.participantIds,
      privateText: secret.privateText,
      publicMask: secret.publicMask,
      reason: '用户在角色关系页手动撤回该小秘密。',
      evidence: secret.publicMask || 'manual_revoke_from_character_relationship_tab',
      sourceMessageIds: secret.sourceMessageIds,
      emotionalWeight: secret.emotionalWeight,
      confidence: 1,
    },
  };
}

function buildManualSharedSecretConsequenceEvent(
  chat: GroupChat,
  character: AICharacter,
  secret: SharedSecret,
  consequenceKind: NonNullable<SharedSecret['consequenceKind']>,
): RuntimeEventV2 {
  const now = Date.now();
  const includesUser = secret.participantIds.includes('user');
  const action = secret.leakState === 'confessed'
    ? 'confessed'
    : secret.leakState === 'leaked'
      ? 'leaked'
      : secret.leakState === 'hinted_publicly'
        ? 'hinted_publicly'
        : 'recorded';
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, secret.id, 'shared-secret-consequence', consequenceKind]),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: secret.participantIds,
    summary: `${character.name} 记录用户修正了一条小秘密后果`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: secret.participantIds,
    payload: {
      eventType: 'companionship_shared_secret',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      secretId: secret.id,
      action,
      consequenceKind,
      participantIds: secret.participantIds,
      privateText: secret.privateText,
      publicMask: secret.publicMask,
      reason: `用户在角色关系页手动修正小秘密后果为 ${consequenceKind}。`,
      evidence: secret.publicMask || 'manual_secret_consequence_correction_from_character_relationship_tab',
      sourceMessageIds: secret.sourceMessageIds,
      emotionalWeight: secret.emotionalWeight,
      confidence: 1,
    },
  };
}

function buildManualSharedSecretMaskEvent(chat: GroupChat, character: AICharacter, secret: SharedSecret, publicMask: string): RuntimeEventV2 {
  const now = Date.now();
  const includesUser = secret.participantIds.includes('user');
  const action = secret.leakState === 'confessed'
    ? 'confessed'
    : secret.leakState === 'leaked'
      ? 'leaked'
      : secret.leakState === 'hinted_publicly'
        ? 'hinted_publicly'
        : 'recorded';
  const normalizedMask = clipRuntimeText(publicMask, 80);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, secret.id, normalizedMask, 'shared-secret-mask']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: secret.participantIds,
    summary: `${character.name} 记录用户修正了一条小秘密公开描述`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: secret.participantIds,
    payload: {
      eventType: 'companionship_shared_secret',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      secretId: secret.id,
      action,
      consequenceKind: secret.consequenceKind,
      participantIds: secret.participantIds,
      privateText: secret.privateText,
      publicMask: normalizedMask,
      reason: '用户在角色关系页手动修正小秘密公开描述。',
      evidence: `manual_secret_mask_edit_from_character_relationship_tab: ${secret.publicMask} -> ${normalizedMask}`,
      sourceMessageIds: secret.sourceMessageIds,
      emotionalWeight: secret.emotionalWeight,
      confidence: 1,
    },
  };
}

function buildManualSharedSecretPairPrivateEvent(chat: GroupChat, character: AICharacter, secret: SharedSecret): RuntimeEventV2 {
  const now = Date.now();
  const action = secret.leakState === 'confessed'
    ? 'confessed'
    : secret.leakState === 'leaked'
      ? 'leaked'
      : secret.leakState === 'hinted_publicly'
        ? 'hinted_publicly'
        : 'recorded';
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, secret.id, 'shared-secret-pair-private']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户收窄了一条小秘密参与者`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_shared_secret',
      characterId: character.id,
      userId: 'user',
      secretId: secret.id,
      action,
      consequenceKind: secret.consequenceKind,
      participantIds: [character.id, 'user'],
      privateText: secret.privateText,
      publicMask: secret.publicMask,
      reason: '用户在角色关系页手动把小秘密参与者收窄为自己和该角色。',
      evidence: `manual_secret_participants_pair_private_from_character_relationship_tab: ${secret.participantIds.join(',')}`,
      sourceMessageIds: secret.sourceMessageIds,
      emotionalWeight: secret.emotionalWeight,
      confidence: 1,
    },
  };
}

function buildManualSharedSecretParticipantsEvent(chat: GroupChat, character: AICharacter, secret: SharedSecret, participantIds: string[]): RuntimeEventV2 {
  const now = Date.now();
  const nextParticipantIds = Array.from(new Set(participantIds.filter(Boolean))).slice(0, 6);
  const includesUser = nextParticipantIds.includes('user');
  const action = secret.leakState === 'confessed'
    ? 'confessed'
    : secret.leakState === 'leaked'
      ? 'leaked'
      : secret.leakState === 'hinted_publicly'
        ? 'hinted_publicly'
        : 'recorded';
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, secret.id, nextParticipantIds.join(','), 'shared-secret-participants']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: nextParticipantIds,
    summary: `${character.name} 记录用户修正了一条小秘密参与者`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: nextParticipantIds,
    payload: {
      eventType: 'companionship_shared_secret',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      secretId: secret.id,
      action,
      consequenceKind: secret.consequenceKind,
      participantIds: nextParticipantIds,
      privateText: secret.privateText,
      publicMask: secret.publicMask,
      reason: '用户在角色关系页手动修正小秘密参与者。',
      evidence: `manual_secret_participants_edit_from_character_relationship_tab: ${secret.participantIds.join(',')} -> ${nextParticipantIds.join(',')}`,
      sourceMessageIds: secret.sourceMessageIds,
      emotionalWeight: secret.emotionalWeight,
      confidence: 1,
    },
  };
}

function buildManualSharedSecretRestorePublicEvent(chat: GroupChat, character: AICharacter, item: SharedSecretHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const participantIds = item.participantIds.length ? item.participantIds : [character.id, 'user'];
  const includesUser = participantIds.includes('user');
  const action = item.leakState === 'confessed'
    ? 'confessed'
    : item.leakState === 'leaked'
      ? 'leaked'
      : item.leakState === 'hinted_publicly'
        ? 'hinted_publicly'
        : 'recorded';
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, item.secretId, 'shared-secret-public-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: participantIds,
    summary: `${character.name} 记录用户从历史中恢复了一条小秘密公开边界`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: participantIds,
    payload: {
      eventType: 'companionship_shared_secret',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      secretId: item.secretId,
      action,
      consequenceKind: item.consequenceKind,
      participantIds,
      privateText: item.publicMask,
      publicMask: item.publicMask,
      reason: `用户在开发者诊断中从小秘密历史 ${item.id} 恢复公开遮罩和边界；历史诊断不保存私密原文。`,
      evidence: ['manual_restore_public_mask_from_shared_secret_history', ...item.evidence].filter(Boolean).join(' / '),
      sourceMessageIds: item.sourceMessageIds,
      emotionalWeight: item.emotionalWeight,
      confidence: 1,
    },
  };
}

function buildManualSharedPhraseSuppressedEvent(chat: GroupChat, character: AICharacter, phrase: SharedPhrase): RuntimeEventV2 {
  const now = Date.now();
  const includesUser = phrase.participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, phrase.id, 'shared-phrase-suppressed']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: phrase.participantIds,
    summary: `${character.name} 记录用户抑制了一句共同话语`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: phrase.participantIds,
    payload: {
      eventType: 'companionship_shared_phrase',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      phraseId: phrase.id,
      action: 'suppressed',
      text: phrase.text,
      kind: phrase.kind,
      participantIds: phrase.participantIds,
      visibility: phrase.visibility,
      firstSaidBy: phrase.firstSaidBy,
      reason: '用户在角色关系页手动抑制该共同话语。',
      evidence: phrase.evidence || phrase.text,
      sourceMessageIds: phrase.sourceMessageIds,
      emotionalWeight: phrase.emotionalWeight,
      reuseCount: phrase.reuseCount,
      confidence: 1,
    },
  };
}

function buildManualSharedPhraseUpsertEvent(
  chat: GroupChat,
  character: AICharacter,
  phrase: SharedPhrase,
  patch: { text: string; kind: SharedPhrase['kind']; visibility: SharedPhrase['visibility'] },
): RuntimeEventV2 {
  const now = Date.now();
  const normalized = patch.text.trim();
  const includesUser = phrase.participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, phrase.id, normalized, patch.kind, patch.visibility, 'shared-phrase-upsert']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: phrase.participantIds,
    summary: `${character.name} 记录用户修正了一句共同话语`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: phrase.participantIds,
    payload: {
      eventType: 'companionship_shared_phrase',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      phraseId: phrase.id,
      action: 'upsert',
      text: normalized,
      kind: patch.kind,
      participantIds: phrase.participantIds,
      visibility: patch.visibility,
      firstSaidBy: phrase.firstSaidBy,
      reason: '用户在角色关系页手动修正该共同话语。',
      evidence: `manual_shared_phrase_edit_from_character_relationship_tab: ${phrase.text}/${phrase.kind}/${phrase.visibility} -> ${normalized}/${patch.kind}/${patch.visibility}`,
      sourceMessageIds: phrase.sourceMessageIds,
      emotionalWeight: phrase.emotionalWeight,
      reuseCount: phrase.reuseCount,
      confidence: 1,
    },
  };
}

function buildManualSharedPhrasePairPrivateEvent(chat: GroupChat, character: AICharacter, phrase: SharedPhrase): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, phrase.id, 'shared-phrase-pair-private']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户收窄了一句共同话语参与者`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_shared_phrase',
      characterId: character.id,
      userId: 'user',
      phraseId: phrase.id,
      action: 'upsert',
      text: phrase.text,
      kind: phrase.kind,
      participantIds: [character.id, 'user'],
      visibility: phrase.visibility,
      firstSaidBy: phrase.firstSaidBy,
      reason: '用户在角色关系页手动把共同话语参与者收窄为自己和该角色。',
      evidence: `manual_shared_phrase_participants_pair_private_from_character_relationship_tab: ${phrase.participantIds.join(',')}`,
      sourceMessageIds: phrase.sourceMessageIds,
      emotionalWeight: phrase.emotionalWeight,
      reuseCount: phrase.reuseCount,
      confidence: 1,
    },
  };
}

function buildManualSharedPhraseParticipantsEvent(chat: GroupChat, character: AICharacter, phrase: SharedPhrase, participantIds: string[]): RuntimeEventV2 {
  const now = Date.now();
  const nextParticipantIds = Array.from(new Set(participantIds.filter(Boolean))).slice(0, 6);
  const includesUser = nextParticipantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, phrase.id, nextParticipantIds.join(','), 'shared-phrase-participants']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: nextParticipantIds,
    summary: `${character.name} 记录用户修正了一句共同话语参与者`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: nextParticipantIds,
    payload: {
      eventType: 'companionship_shared_phrase',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      phraseId: phrase.id,
      action: 'upsert',
      text: phrase.text,
      kind: phrase.kind,
      participantIds: nextParticipantIds,
      visibility: phrase.visibility,
      firstSaidBy: phrase.firstSaidBy,
      reason: '用户在角色关系页手动修正共同话语参与者。',
      evidence: `manual_shared_phrase_participants_edit_from_character_relationship_tab: ${phrase.participantIds.join(',')} -> ${nextParticipantIds.join(',')}`,
      sourceMessageIds: phrase.sourceMessageIds,
      emotionalWeight: phrase.emotionalWeight,
      reuseCount: phrase.reuseCount,
      confidence: 1,
    },
  };
}

function buildManualSharedPhraseRestoreEvent(chat: GroupChat, character: AICharacter, item: SharedPhraseHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, item.phraseId, 'shared-phrase-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: item.participantIds,
    summary: `${character.name} 记录用户从历史中恢复了一句共同话语`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: item.participantIds,
    payload: {
      eventType: 'companionship_shared_phrase',
      characterId: character.id,
      userId: 'user',
      phraseId: item.phraseId,
      action: 'upsert',
      text: item.text,
      kind: item.kind,
      participantIds: item.participantIds,
      visibility: item.visibility,
      firstSaidBy: item.firstSaidBy,
      reason: `用户在开发者诊断中从共同话语历史 ${item.id} 恢复。`,
      evidence: ['manual_restore_from_shared_phrase_history', ...item.evidence].filter(Boolean).join(' / '),
      sourceMessageIds: item.sourceMessageIds,
      emotionalWeight: item.emotionalWeight,
      reuseCount: item.reuseCount,
      confidence: 1,
    },
  };
}

function buildManualRitualActionEvent(chat: GroupChat, character: AICharacter, ritual: RitualRegistryEntry, action: 'suppressed' | 'restored'): RuntimeEventV2 {
  const now = Date.now();
  const isRestored = action === 'restored';
  const includesUser = ritual.participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, ritual.id, `ritual-${action}`]),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: ritual.participantIds,
    summary: `${character.name} 记录用户${isRestored ? '恢复' : '抑制'}了一个关系仪式`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: ritual.participantIds,
    payload: {
      eventType: 'companionship_ritual',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      ritualId: ritual.id,
      kind: ritual.kind,
      action,
      participantIds: ritual.participantIds,
      content: ritual.content,
      evolution: ritual.evolution,
      reason: isRestored ? '用户在角色关系页手动恢复该关系仪式。' : '用户在角色关系页手动抑制该关系仪式。',
      evidence: ritual.content,
      sourceMessageIds: ritual.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualRitualUpdateEvent(chat: GroupChat, character: AICharacter, ritual: RitualRegistryEntry, content: string): RuntimeEventV2 {
  const now = Date.now();
  const normalized = clipRuntimeText(content, 180);
  const includesUser = ritual.participantIds.includes('user');
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, ritual.id, normalized, 'ritual-updated']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: ritual.participantIds,
    summary: `${character.name} 记录用户修正了一个关系仪式`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: ritual.participantIds,
    payload: {
      eventType: 'companionship_ritual',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      ritualId: ritual.id,
      kind: ritual.kind,
      action: 'updated',
      participantIds: ritual.participantIds,
      content: normalized,
      evolution: [...(ritual.evolution || []), `用户修正：${normalized}`].slice(-6),
      reason: '用户在角色关系页手动修正关系仪式内容。',
      evidence: `manual_ritual_update_from_character_relationship_tab: ${ritual.content} -> ${normalized}`,
      sourceMessageIds: ritual.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualRitualRestoreFromHistoryEvent(chat: GroupChat, character: AICharacter, item: RitualHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const participantIds = item.participantIds.length ? item.participantIds : [character.id, 'user'];
  const includesUser = participantIds.includes('user');
  const restoredContent = clipRuntimeText(item.content || item.reason || item.evidence[0] || '', 180);
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, item.ritualId, 'ritual-history-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: participantIds,
    summary: `${character.name} 记录用户从历史中恢复了一个关系仪式`,
    channelId: includesUser ? 'pair-private' : 'relationship-runtime',
    eventClass: 'artifact',
    visibility: includesUser ? 'pair_private' : 'role_private',
    visibleToIds: participantIds,
    payload: {
      eventType: 'companionship_ritual',
      characterId: character.id,
      userId: includesUser ? 'user' : undefined,
      ritualId: item.ritualId,
      kind: item.kind,
      action: 'updated',
      participantIds,
      content: restoredContent,
      evolution: [...item.evolution, `从仪式历史 ${item.id} 恢复：${restoredContent}`].filter(Boolean).slice(-6),
      reason: `用户在开发者诊断中从仪式历史 ${item.id} 恢复内容。`,
      evidence: ['manual_restore_from_ritual_history', ...item.evidence].filter(Boolean).join(' / '),
      sourceMessageIds: item.sourceMessageIds,
      confidence: 1,
    },
  };
}

function buildManualPhaseCorrectionEvent(chat: GroupChat, character: AICharacter, phase: CompanionshipPhase, style: CompanionshipStyle): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, phase, style, 'phase-correction']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户手动修正了陪伴关系阶段`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_phase_event',
      characterId: character.id,
      userId: 'user',
      action: 'set',
      phase,
      style,
      reason: '用户在角色关系页手动修正陪伴关系阶段。',
      evidence: ['manual_phase_correction_from_character_relationship_tab'],
      initiatedBy: 'user',
      confidence: 1,
    },
  };
}

function buildManualPhaseRestoreFromHistoryEvent(chat: GroupChat, character: AICharacter, item: PhaseHistoryEntry): RuntimeEventV2 {
  const now = Date.now();
  const phase = item.phase || 'curious';
  const style = item.style || 'friend';
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, item.id, phase, style, 'phase-history-restore']),
    conversationId: chat.id,
    kind: 'artifact',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id],
    summary: `${character.name} 记录用户从历史中恢复了陪伴关系阶段`,
    channelId: 'pair-private',
    eventClass: 'artifact',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_phase_event',
      characterId: character.id,
      userId: 'user',
      action: 'set',
      phase,
      style,
      reason: `用户在开发者诊断中从阶段历史 ${item.id} 恢复为${formatCompanionshipPhaseLabel(phase)}。`,
      evidence: ['manual_restore_from_phase_history', ...item.evidence],
      sourceMessageIds: item.sourceMessageIds,
      initiatedBy: 'user',
      confidence: 1,
    },
  };
}

function buildManualPhaseRevokeEvent(chat: GroupChat, character: AICharacter): RuntimeEventV2 {
  const now = Date.now();
  return {
    id: buildManualCompanionshipEventId([chat.id, character.id, 'phase-revoked']),
    conversationId: chat.id,
    kind: 'phase_transition',
    createdAt: now,
    actorIds: ['user'],
    targetIds: [character.id, 'user'],
    summary: `${character.name} 记录用户恢复了陪伴阶段自动判断`,
    channelId: 'pair-private',
    eventClass: 'phase',
    visibility: 'pair_private',
    visibleToIds: ['user', character.id],
    payload: {
      eventType: 'companionship_phase_event',
      characterId: character.id,
      userId: 'user',
      action: 'revoked',
      reason: '用户在角色关系页恢复陪伴阶段自动判断。',
      evidence: ['manual_phase_revoke_from_character_relationship_tab'],
      confidence: 1,
    },
  };
}

function formatUserProfileMemoryKindLabel(kind: UserProfileMemoryKind) {
  const labels: Record<UserProfileMemoryKind, string> = {
    display_name: '名字',
    address_preference: '称呼',
    schedule_hint: '作息',
    pressure_source: '压力',
    preference: '偏好',
    dislike: '不喜欢',
    boundary: '边界',
    important_date: '日期',
    recent_plan: '计划',
    emotional_pattern: '情绪',
  };
  return labels[kind] || kind;
}


export {
  buildManualAddressingEvent,
  buildManualAddressingSetEvent,
  buildManualAttachmentProfileEvent,
  buildManualCareTopicBlockedEvent,
  buildManualCareTopicRestoreEvent,
  buildManualIntimateConflictDismissedEvent,
  buildManualIntimateConflictResolvedEvent,
  buildManualIntimateConflictRestoreEvent,
  buildManualPhaseCorrectionEvent,
  buildManualPhaseRestoreFromHistoryEvent,
  buildManualPhaseRevokeEvent,
  buildManualPromiseLifecycleEvent,
  buildManualPromiseMergeEvents,
  buildManualPromiseRestoreEvent,
  buildManualPromiseUpsertEvent,
  buildManualRitualActionEvent,
  buildManualRitualRestoreFromHistoryEvent,
  buildManualRitualUpdateEvent,
  buildManualSharedAnchorArchiveEvent,
  buildManualSharedAnchorPairPrivateEvent,
  buildManualSharedAnchorParticipantsEvent,
  buildManualSharedAnchorRestoreEvent,
  buildManualSharedAnchorUpsertEvent,
  buildManualSharedPhrasePairPrivateEvent,
  buildManualSharedPhraseParticipantsEvent,
  buildManualSharedPhraseRestoreEvent,
  buildManualSharedPhraseSuppressedEvent,
  buildManualSharedPhraseUpsertEvent,
  buildManualSharedSecretConsequenceEvent,
  buildManualSharedSecretMaskEvent,
  buildManualSharedSecretPairPrivateEvent,
  buildManualSharedSecretParticipantsEvent,
  buildManualSharedSecretRestorePublicEvent,
  buildManualSharedSecretRevokedEvent,
  buildManualUserProfileMemoryRestoreEvent,
  buildManualUserProfileMemoryRevokeEvent,
  buildManualUserProfileMemoryUpsertEvent,
  clipRuntimeText,
  INTERACTION_PACE_OPTIONS,
  formatAddressingActionLabel,
  formatAttachmentActionLabel,
  formatAttachmentStyleLabel,
  formatCareTopicActionLabel,
  formatInteractionPacePreferenceLabel,
  formatIntimateConflictActionLabel,
  formatPromiseActionLabel,
  formatRitualActionLabel,
  formatRuntimeEvidence,
  formatUserProfileMemoryActionLabel,
  formatUserProfileMemoryKindLabel,
};
