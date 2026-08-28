import type { GroupChat, SessionFamily, SessionKind } from '../types/chat';
import { resolveConversationCapabilities, type ConversationCapabilityProfile } from './conversationCapabilities';

/**
 * Cross-play capability vocabulary. This is intentionally an internal registry,
 * not a third-party plugin loader: capabilities are resolved from room metadata
 * and engine constraints so existing rooms keep their legacy behaviour.
 */
export type RoomCapabilityId =
  | 'conversation'
  | 'memory'
  | 'relationship'
  | 'artifacts'
  | 'structured-data'
  | 'knowledge'
  | 'assessment'
  | 'workflow'
  | 'web-search'
  | 'local-files'
  | 'html-interactive'
  | 'media';

export type RoomCapabilityMode = 'off' | 'assisted' | 'automatic';

export interface RoomCapabilityDescriptor {
  id: RoomCapabilityId;
  mode: RoomCapabilityMode;
  read: boolean;
  write: boolean;
  delete: boolean;
  export: boolean;
  reason: 'template' | 'legacy' | 'engine-constraint' | 'entitlement' | 'runtime';
}

export interface RoomCapabilityInput {
  chat: Pick<GroupChat, 'type' | 'mode' | 'modeConfig' | 'governance' | 'directorControls' | 'showRoleActions' | 'scenarioState' | 'sessionKind' | 'modeState'>;
  templateCapabilities?: Partial<Record<RoomCapabilityId, RoomCapabilityMode>>;
  overrides?: Partial<Record<RoomCapabilityId, RoomCapabilityMode>>;
  entitlements?: Partial<Record<'agent' | 'webSearch' | 'localFiles' | 'assistantArtifactCloudSync', boolean>>;
}

const STUDY_SCENARIOS = new Set(['learning-progress', 'ielts-coach']);
const ALL_CAPABILITY_IDS: RoomCapabilityId[] = [
  'conversation', 'memory', 'relationship', 'artifacts', 'structured-data', 'knowledge',
  'assessment', 'workflow', 'web-search', 'local-files', 'html-interactive', 'media',
];

function familyOf(sessionKind?: SessionKind): SessionFamily | undefined {
  return sessionKind?.family;
}

function descriptor(id: RoomCapabilityId, mode: RoomCapabilityMode, reason: RoomCapabilityDescriptor['reason']): RoomCapabilityDescriptor {
  const enabled = mode !== 'off';
  return {
    id,
    mode,
    read: enabled,
    write: enabled && id !== 'web-search' && id !== 'media',
    delete: enabled && (id === 'artifacts' || id === 'structured-data' || id === 'knowledge'),
    export: enabled && (id === 'artifacts' || id === 'structured-data'),
    reason,
  };
}

/**
 * Resolves optional capabilities without changing any engine or stored room
 * fields. Callers can adopt this profile incrementally behind feature flags.
 */
export function resolveRoomCapabilities(input: RoomCapabilityInput): Record<RoomCapabilityId, RoomCapabilityDescriptor> {
  const family = familyOf(input.chat.sessionKind);
  const scenarioId = input.chat.sessionKind?.scenarioId || '';
  const study = family === 'study' || input.chat.mode === 'classroom' || STUDY_SCENARIOS.has(scenarioId);
  const agent = family === 'agent' || input.chat.mode === 'agent_workflow';
  const legacyConversation: ConversationCapabilityProfile = resolveConversationCapabilities(input.chat);
  const defaults: Partial<Record<RoomCapabilityId, RoomCapabilityMode>> = {
    conversation: legacyConversation.roleActions ? 'assisted' : 'off',
    memory: 'assisted',
    relationship: family === 'conversation' || input.chat.type === 'direct' ? 'assisted' : 'off',
    ...(study ? {
      knowledge: 'assisted',
      artifacts: 'assisted',
      'structured-data': 'assisted',
      assessment: 'assisted',
      'html-interactive': 'assisted',
      // Whether audio is actually available remains controlled by configured
      // TTS profiles. This declares that the study surface may request it.
      media: 'assisted',
    } : {}),
    ...(agent ? { workflow: 'automatic', artifacts: 'automatic', 'structured-data': 'automatic' } : {}),
  };
  const merged = { ...defaults, ...(input.templateCapabilities || {}), ...(input.overrides || {}) };
  const result = {} as Record<RoomCapabilityId, RoomCapabilityDescriptor>;
  ALL_CAPABILITY_IDS.filter((id) => !['web-search', 'local-files', 'media'].includes(id)).forEach((id) => {
    result[id] = descriptor(id, merged[id] || 'off', input.overrides?.[id] ? 'runtime' : input.templateCapabilities?.[id] ? 'template' : 'legacy');
  });
  (['web-search', 'local-files', 'media'] as RoomCapabilityId[]).forEach((id) => {
    const enabled = id === 'web-search'
      ? Boolean(input.entitlements?.webSearch)
      : id === 'local-files'
        ? Boolean(input.entitlements?.localFiles)
        : true;
    const requested = merged[id] || 'off';
    result[id] = descriptor(id, enabled ? requested : 'off', enabled ? 'template' : 'entitlement');
  });
  return result;
}

export function hasRoomCapability(chat: GroupChat, id: RoomCapabilityId, mode: RoomCapabilityMode = 'assisted') {
  const current = resolveRoomCapabilities({ chat })[id];
  const rank: Record<RoomCapabilityMode, number> = { off: 0, assisted: 1, automatic: 2 };
  return rank[current.mode] >= rank[mode];
}

export type StudyParticipantRole = 'teacher' | 'assistant_teacher' | 'student' | 'reviewer' | 'examiner' | 'observer';

export interface StudyParticipantProfile {
  actorId: string;
  role: StudyParticipantRole;
  expertise: string[];
  teachingMode: 'entertainment' | 'casual' | 'serious';
  canAssess: boolean;
  canWriteKnowledge: boolean;
}

/** Keeps participant identity (AICharacter/user) separate from study duties. */
export function resolveStudyParticipantProfile(params: {
  actorId: string;
  role?: StudyParticipantRole;
  expertise?: string[];
  teachingMode?: StudyParticipantProfile['teachingMode'];
  canAssess?: boolean;
  canWriteKnowledge?: boolean;
}): StudyParticipantProfile {
  const role = params.role || 'student';
  const teacher = role === 'teacher' || role === 'assistant_teacher' || role === 'reviewer' || role === 'examiner';
  return {
    actorId: params.actorId,
    role,
    expertise: (params.expertise || []).filter((item) => item.trim()).slice(0, 32),
    teachingMode: params.teachingMode || (teacher ? 'casual' : 'casual'),
    canAssess: params.canAssess ?? (role === 'teacher' || role === 'reviewer' || role === 'examiner'),
    canWriteKnowledge: params.canWriteKnowledge ?? teacher,
  };
}
