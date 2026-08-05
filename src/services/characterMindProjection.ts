import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import { buildUserCompanionshipProjection } from './companionshipProjection';
import { projectNarrativeLines, type NarrativeLineProjection } from './narrativeProjection';
import { normalizeRelationshipLedgerEntry } from './relationshipLedger';

const USER_ACTOR_ID = 'user';

export interface CharacterMindProjection {
  identity: {
    selfModel: string[];
    stableVoice: string[];
    desires: string[];
    fears: string[];
  };
  continuity: {
    userProfile: string[];
    selfMemories: string[];
    relationshipMemories: string[];
    sharedHistory: string[];
  };
  relationship: {
    targetId?: string;
    targetName?: string;
    stance: string[];
    currentRoomPressure: string[];
  };
  currentState: {
    emotionalUndercurrent: string[];
    activeNeeds: string[];
    selfAppraisal?: string;
  };
  room: {
    topic?: string;
    activeLines: string[];
    worldActivities: string[];
    constraints: string[];
  };
  expression: {
    socialMove: string;
    temperature: string;
    attention: string;
    length: string;
    omissions: string[];
  };
  hidden: {
    sourceIds: string[];
    conflictReasons: string[];
    privacyGuards: string[];
    recallCandidates: string[];
  };
}

function compactText(text: string | undefined | null, max = 140) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function uniqueText(items: Array<string | undefined | null>, max = 6) {
  return Array.from(new Set(items.map((item) => compactText(item)).filter(Boolean))).slice(0, max);
}

function characterName(id: string | undefined, characters: AICharacter[]) {
  if (id === USER_ACTOR_ID) return '用户';
  return characters.find((item) => item.id === id)?.name || '成员';
}

function visibleMessages(messages: Message[]) {
  return messages.filter((item) => !item.isDeleted && item.type !== 'system' && item.type !== 'event');
}

function resolveTarget(params: {
  chat: GroupChat;
  character: AICharacter;
  messages: Message[];
  characters: AICharacter[];
  target?: { id: string; name?: string } | null;
}) {
  if (params.target) {
    return { id: params.target.id, name: params.target.name || characterName(params.target.id, params.characters) };
  }
  if (params.chat.type === 'direct') return { id: USER_ACTOR_ID, name: '用户' };

  const latestOther = visibleMessages(params.messages)
    .slice()
    .reverse()
    .find((item) => item.senderId !== params.character.id);
  if (latestOther) {
    return {
      id: latestOther.senderId,
      name: latestOther.senderName || characterName(latestOther.senderId, params.characters),
    };
  }

  const firstOther = params.characters.find((item) => item.id !== params.character.id);
  return firstOther ? { id: firstOther.id, name: firstOther.name } : undefined;
}

function resolveRelationship(params: {
  character: AICharacter;
  chat: GroupChat;
  targetId?: string;
}) {
  if (!params.targetId) return null;

  const authored = params.character.relationships.find((item) => item.characterId === params.targetId);
  if (authored) {
    return {
      warmth: authored.warmth,
      competence: authored.competence,
      trust: authored.trust,
      threat: authored.threat,
      note: authored.note || '',
    };
  }

  const ledger = (params.chat.relationshipLedger || [])
    .map(normalizeRelationshipLedgerEntry)
    .find((item) => item.actorId === params.character.id && item.targetId === params.targetId);
  if (!ledger) return null;
  return {
    warmth: ledger.current.warmth,
    competence: ledger.current.competence,
    trust: ledger.current.trust,
    threat: ledger.current.threat,
    note: ledger.derived?.semantic?.summary || '',
  };
}

function formatRelationshipStance(relationship: ReturnType<typeof resolveRelationship>) {
  if (!relationship) return [];
  const stance = [
    relationship.warmth >= 12 ? '更容易靠近、维护或给对方留余地' : relationship.warmth <= -12 ? '不主动给温度，倾向保持距离' : '',
    relationship.trust >= 12 ? '更愿意配合或透露' : relationship.trust <= -12 ? '会验证、保留或不轻易相信' : '',
    relationship.competence >= 12 ? '认可对方的判断能力' : relationship.competence <= -12 ? '容易挑战对方的判断' : '',
    relationship.threat >= 20 ? '保持戒备，避免把主动权交出去' : '',
    relationship.note,
  ];
  return uniqueText(stance, 4);
}

function collectMemoryText(character: AICharacter, targetId?: string) {
  const memories = character.layeredMemories || [];
  const userProfile = [
    ...(character.memory?.userMemories || []),
    ...memories
      .filter((item) => item.subjectIds?.includes(USER_ACTOR_ID) || item.sourceTag?.includes('direct_user') || item.text.includes('用户'))
      .map((item) => item.summary || item.text),
  ];
  const selfMemories = memories
    .filter((item) => item.scope === 'character_self')
    .map((item) => item.summary || item.text);
  const relationshipMemories = memories
    .filter((item) => item.scope === 'relationship' && (!targetId || item.subjectIds?.includes(targetId)))
    .map((item) => item.summary || item.text);
  const sharedHistory = memories
    .filter((item) => item.scope === 'conversation' || item.scope === 'thread')
    .map((item) => item.summary || item.text);
  return {
    userProfile: uniqueText(userProfile, 8),
    selfMemories: uniqueText(selfMemories, 6),
    relationshipMemories: uniqueText(relationshipMemories, 6),
    sharedHistory: uniqueText(sharedHistory, 6),
  };
}

function companionshipContinuity(params: {
  chat: GroupChat;
  character: AICharacter;
  messages: Message[];
}) {
  if (params.chat.type !== 'direct') {
    return {
      userProfile: [],
      relationshipMemories: [],
      sharedHistory: [],
      privacyGuards: [] as string[],
    };
  }

  const projection = buildUserCompanionshipProjection({
    chat: params.chat,
    character: params.character,
    messages: params.messages,
  });
  const bond = projection.userBond;
  if (!bond) {
    return {
      userProfile: [],
      relationshipMemories: [],
      sharedHistory: [],
      privacyGuards: [],
    };
  }

  return {
    userProfile: uniqueText([
      bond.userProfile.displayName,
      bond.userProfile.addressPreference,
      ...bond.userProfile.preferences,
      ...bond.userProfile.dislikes,
      ...bond.userProfile.scheduleHints,
      ...bond.userProfile.pressureSources,
      ...bond.userProfile.importantDates,
      ...bond.userProfile.recentPlans,
    ], 8),
    relationshipMemories: uniqueText([
      ...bond.pendingPromises.map((item) => item.text),
      ...bond.unresolvedTensions,
    ], 6),
    sharedHistory: uniqueText(projection.evidence, 4),
    privacyGuards: uniqueText(bond.userProfile.boundaries, 4),
  };
}

function formatNarrativeLine(line: NarrativeLineProjection) {
  return `${line.title}: ${compactText(line.summary, 120)}`;
}

function emotionSignals(character: AICharacter) {
  const emotional = character.emotionalState;
  const soul = character.soulState;
  return uniqueText([
    emotional && emotional.excitement > 60 ? '精力较高，容易主动接话' : '',
    emotional && emotional.irritation > 60 ? '有 irritability，容易顶回或缩短耐心' : '',
    emotional && emotional.affection > 55 ? '对信任对象更容易柔和' : '',
    emotional && emotional.insecurity > 60 ? '担心被误解，表达更防御' : '',
    emotional && emotional.embarrassment > 55 ? '有些自我防备，不愿把真实反应说透' : '',
    soul && soul.energy < 35 ? '精力偏低，不适合长篇完整表达' : '',
    soul && soul.loneliness > 60 ? '有被接住或获得回应的需要' : '',
    soul && soul.repression > 60 ? '有内容压着没有直接说出口' : '',
  ], 5);
}

function selfAppraisal(character: AICharacter) {
  const soul = character.soulState;
  if (!soul?.lastImpulse) return undefined;
  if (soul.lastImpulse === 'repair') return '刚才或近期的表达留下了需要找补的余波。';
  if (soul.lastImpulse === 'seek_attention' && soul.ignoredStreak >= 2) return '没有被接住时，会在意自己是否被忽略。';
  if (soul.lastImpulse === 'defend_face' && soul.shame >= 52) return '被触及面子时，可能意识到自己正在嘴硬。';
  if (soul.lastImpulse === 'withdraw' || soul.lastImpulse === 'avoid') return '此刻更倾向先退开，不急着把话说满。';
  return undefined;
}

function buildRoomPressure(params: {
  chat: GroupChat;
  targetId?: string;
}) {
  const room = params.chat.worldState.structuredRoomState;
  if (!room) return [];
  return uniqueText([
    room.pileOnTarget === params.targetId ? '目标正在承受房间里的集中压力。' : '',
    params.targetId && room.dominantThread?.includes(params.targetId) ? '目标处于房间主要对话线程。' : '',
    params.targetId && room.alliances.some((pair) => pair.includes(params.targetId as string)) ? '目标牵涉当前可见联盟。' : '',
    params.targetId && room.conflictPairs.some((pair) => pair.includes(params.targetId as string)) ? '目标牵涉当前可见冲突。' : '',
    room.heat >= 65 ? '房间热度较高，普通话需要考虑公开压力。' : '',
    room.cohesion <= 35 ? '房间凝聚度偏低，成员更容易各说各话。' : '',
  ], 6);
}

export function buildCharacterMindProjection(params: {
  chat: GroupChat;
  character: AICharacter;
  characters: AICharacter[];
  messages: Message[];
  target?: { id: string; name?: string } | null;
  now?: number;
}): CharacterMindProjection {
  const now = params.now || Date.now();
  const target = resolveTarget(params);
  const relationship = resolveRelationship({
    character: params.character,
    chat: params.chat,
    targetId: target?.id,
  });
  const memories = collectMemoryText(params.character, target?.id);
  const companionship = companionshipContinuity(params);
  const narrativeLines = projectNarrativeLines({
    chat: params.chat,
    characters: params.characters,
    messages: params.messages,
    now,
  });
  const activeLines = narrativeLines.slice(0, 5).map(formatNarrativeLine);
  const worldActivities = narrativeLines
    .filter((line) => line.type === 'scenario' || line.type === 'faction' || line.type === 'goal' || line.type === 'growth')
    .slice(0, 4)
    .map(formatNarrativeLine);
  const identity = params.character.coreProfile;
  const roomPressure = buildRoomPressure({ chat: params.chat, targetId: target?.id });
  const emotionalUndercurrent = emotionSignals(params.character);
  const activeNeeds = uniqueText([
    identity?.coreDesire,
    identity?.unmetNeeds?.join('、'),
    params.character.soulState?.lastImpulseReason,
  ], 4);
  const privacyGuards = uniqueText([
    ...companionship.privacyGuards,
    params.chat.type === 'group' && memories.userProfile.length ? '用户相关私密事实只能影响克制和关心，不要在公开房间直接说出。' : '',
  ], 5);
  const conflictReasons = uniqueText([
    relationship && relationship.threat >= 20 ? '关系中的戒备与当前对话目标可能冲突。' : '',
    relationship && relationship.warmth >= 12 && relationship.threat >= 20 ? '想靠近与想防备同时存在。' : '',
    params.character.soulState && params.character.soulState.repression >= 60 ? '有被压住的内容，不一定直接表达。' : '',
    ...narrativeLines.filter((line) => line.tension >= 0.55).slice(0, 3).map((line) => `${line.title}正在和普通聊天节奏竞争。`),
  ], 5);

  return {
    identity: {
      selfModel: uniqueText([
        params.character.background,
        identity?.selfImage,
        identity?.socialMask,
        identity?.values?.join('、'),
      ], 6),
      stableVoice: uniqueText([
        params.character.speakingStyle,
        identity?.interactionHabits?.join('、'),
        params.character.speechProfile?.sentenceLengthBias ? `表达长度倾向：${params.character.speechProfile.sentenceLengthBias}` : '',
      ], 5),
      desires: uniqueText([identity?.coreDesire, ...(identity?.hiddenSoftSpots || [])], 4),
      fears: uniqueText([identity?.coreFear, ...(identity?.sensitivities || [])], 4),
    },
    continuity: {
      userProfile: uniqueText([...memories.userProfile, ...companionship.userProfile], 10),
      selfMemories: memories.selfMemories,
      relationshipMemories: uniqueText([...memories.relationshipMemories, ...companionship.relationshipMemories], 8),
      sharedHistory: uniqueText([...memories.sharedHistory, ...companionship.sharedHistory], 8),
    },
    relationship: {
      targetId: target?.id,
      targetName: target?.name,
      stance: formatRelationshipStance(relationship),
      currentRoomPressure: roomPressure,
    },
    currentState: {
      emotionalUndercurrent,
      activeNeeds,
      selfAppraisal: selfAppraisal(params.character),
    },
    room: {
      topic: compactText(params.chat.topic, 160) || undefined,
      activeLines,
      worldActivities,
      constraints: uniqueText([
        ...roomPressure,
        params.chat.type === 'group' ? '这是公开多人房间，公开时机、群体压力和可见关系会影响表达。' : '',
      ], 6),
    },
    expression: {
      socialMove: conflictReasons.length ? '先处理当前关系或矛盾压力，再决定是否回答完整。' : '对当前最有注意力的对象做一个具体、自然的回应。',
      temperature: relationship?.threat && relationship.threat >= 20 ? '克制或带防备' : relationship?.warmth && relationship.warmth >= 12 ? '更容易柔和' : '由当前情绪和房间压力决定',
      attention: target ? `注意力暂时落在${target.name}及其刚才的发言上。` : '注意力落在当前话题和最新变化上。',
      length: params.character.soulState?.energy !== undefined && params.character.soulState.energy < 35 ? '允许短、半句或不完整回应。' : '不要为了完整而补齐所有观点，按当下注意力自然决定长度。',
      omissions: privacyGuards.length ? ['私密用户事实', '内部状态分数', '没有自然触发的旧事'] : ['内部状态分数', '没有自然触发的旧事'],
    },
    hidden: {
      sourceIds: [
        ...(params.character.layeredMemories || []).flatMap((item) => item.sourceEventIds || []),
        ...(params.chat.runtimeEventsV2 || []).slice(-12).map((event) => event.id),
      ].filter((id, index, list) => list.indexOf(id) === index).slice(0, 24),
      conflictReasons,
      privacyGuards,
      recallCandidates: uniqueText([
        ...memories.userProfile,
        ...memories.relationshipMemories,
        ...memories.sharedHistory,
      ], 12),
    },
  };
}

function line(label: string, values: string[]) {
  return values.length ? `- ${label}: ${values.join(' / ')}` : '';
}

export interface CharacterMindProjectionPromptOptions {
  visibility?: 'public' | 'private';
  includeActiveRoomLineSummaries?: boolean;
}

function hasPrivateSurfaceRisk(text: string) {
  return /(不要|不想|别|公开|隐私|边界|禁忌|压力|焦虑|面试|考试|生日|纪念|私下|只告诉|秘密|住址|地址|电话|手机号|微信|QQ|生病|不舒服|失眠|抑郁|创伤|计划|下周|明天|今晚|昨晚|约定|承诺|称呼|暗号|失约)/.test(text);
}

function stripInternalIds(text: string) {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '成员')
    .replace(/\b(local-character|draft|evt|msg)-[A-Za-z0-9_-]{6,}\b/g, '成员')
    .replace(/\bstatus_shift\b/g, 'state shift')
    .replace(/\brelationship_delta\b/g, 'relationship change')
    .replace(/\bunknown_internal_source\b/g, 'memory source')
    .replace(/\s+/g, ' ')
    .trim();
}

function promptValues(values: string[], options: Required<CharacterMindProjectionPromptOptions>) {
  return values
    .map((value) => stripInternalIds(value))
    .filter(Boolean)
    .filter((value) => options.visibility === 'private' || !hasPrivateSurfaceRisk(value))
    .slice(0, 4);
}

function visibilityScopedValues(values: string[], publicFallback: string, options: Required<CharacterMindProjectionPromptOptions>) {
  const safe = promptValues(values, options);
  if (options.visibility === 'private') return safe;
  return values.length ? [publicFallback] : [];
}

export function buildCharacterMindProjectionPromptBlock(projection: CharacterMindProjection, options: CharacterMindProjectionPromptOptions = {}) {
  const promptOptions: Required<CharacterMindProjectionPromptOptions> = {
    visibility: options.visibility || 'public',
    includeActiveRoomLineSummaries: options.includeActiveRoomLineSummaries ?? false,
  };
  const userContinuity = visibilityScopedValues(
    projection.continuity.userProfile,
    'User-related continuity exists; use it as restraint, care, or familiarity without exposing private facts.',
    promptOptions,
  );
  const relationshipMemories = visibilityScopedValues(
    projection.continuity.relationshipMemories,
    'Relationship continuity exists; show it through stance, timing, omission, or protection rather than private exposition.',
    promptOptions,
  );
  const sharedHistory = visibilityScopedValues(
    projection.continuity.sharedHistory,
    'Shared history exists; use only as subtext unless the current room already makes it public.',
    promptOptions,
  );
  const stance = promptOptions.visibility === 'private'
    ? promptValues(projection.relationship.stance, promptOptions)
    : visibilityScopedValues(
      projection.relationship.stance,
      'A relationship stance exists toward the current target; let it bend tone without revealing private evidence.',
      promptOptions,
    );
  const activeRoomLines = promptOptions.includeActiveRoomLineSummaries
    ? promptValues(projection.room.activeLines, promptOptions)
    : projection.room.activeLines.length
      ? ['Active room lines exist; react to their pressure without copying recent transcript text.']
      : [];
  const lines = [
    line('Stable self', promptValues(projection.identity.selfModel, promptOptions)),
    line('Voice and habits', promptValues(projection.identity.stableVoice, promptOptions)),
    line('Desires', promptValues(projection.identity.desires, promptOptions)),
    line('Fears and sensitivities', promptValues(projection.identity.fears, promptOptions)),
    line('Continuity about the user', userContinuity),
    line('Relationship memories', relationshipMemories),
    line('Shared history', sharedHistory),
    projection.relationship.targetName ? line(`Stance toward ${projection.relationship.targetName}`, stance) : '',
    line('Current emotional undercurrent', promptValues(projection.currentState.emotionalUndercurrent, promptOptions)),
    line('Active needs', promptValues(projection.currentState.activeNeeds, promptOptions)),
    projection.currentState.selfAppraisal ? `- Self-appraisal: ${stripInternalIds(projection.currentState.selfAppraisal)}` : '',
    projection.room.topic ? `- Current room topic: ${projection.room.topic}` : '',
    line('Active room lines', activeRoomLines),
    line('World or scenario context', promptValues(projection.room.worldActivities, promptOptions)),
    line('Expression guidance', [
      projection.expression.socialMove,
      projection.expression.temperature,
      projection.expression.attention,
      projection.expression.length,
    ].map(stripInternalIds)),
    projection.expression.omissions.length ? `- Keep implicit or omit unless naturally triggered: ${projection.expression.omissions.join(' / ')}.` : '',
    '- This is the character\'s current inner context, not a checklist. Let it bend attention, wording, omissions, and timing without reciting it.',
  ].filter(Boolean);
  return lines.length ? `\n## Character Mind Projection\n${lines.join('\n')}` : '';
}
