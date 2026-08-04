import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { Message } from '../types/message';
import type { SessionGenerationRuntimeBundle } from '../types/sessionEngine';
import type { ChatStyleProfile } from './styleProfileRegistry';
import type { SpeakIntent } from './intentEngine';
import type { InnerLifeProjection } from './innerLifeEngine';
import type { ConversationMovePlan } from './conversationMovePlanner';
import type { TurnPlan } from './turnPlanner';
import type { UserGuidanceIntent } from './userGuidanceIntent';
import { resolveSessionFamilyKey } from './sessionEngineKeys';

export interface TurnDirective {
  roomStyle: 'casual' | 'analytical' | 'discovery' | 'dramatic';
  socialJob: string;
  targetName?: string;
  emotionalUndercurrent: string;
  relationshipEffect: string;
  expressionShape: string;
  userConstraint?: string;
  forbiddenDrift: string[];
}

export interface BuildTurnDirectiveInput {
  chat: GroupChat;
  speaker: AICharacter;
  members: AICharacter[];
  messages: Message[];
  styleProfile?: ChatStyleProfile | string | null;
  intent: SpeakIntent;
  innerLife: InnerLifeProjection;
  conversationMovePlan: ConversationMovePlan;
  turnPlan: TurnPlan;
  runtimeBundle?: SessionGenerationRuntimeBundle | null;
  userGuidance?: UserGuidanceIntent | null;
}

function latestVisible(messages: Message[]) {
  return messages.filter((message) => !message.isDeleted && message.type !== 'system' && message.type !== 'event').at(-1) || null;
}

function speakerName(members: AICharacter[], id?: string) {
  if (!id || id === 'group') return undefined;
  if (id === 'user') return '用户';
  return members.find((member) => member.id === id)?.name || undefined;
}

/**
 * Hybrid prompt architecture boundary:
 * - Use the unified directive only for ordinary public group conversation turns.
 * - Keep direct/AI-private companionship, analysis rooms, story/mystery/gameplay,
 *   and other scenario engines on their dedicated legacy contracts.
 * - This directive replaces scattered per-turn behavior instructions only; full
 *   character, relationship, memory, companionship, and scenario fact blocks stay intact.
 */
export function shouldUseUnifiedTurnDirective(chat: Pick<GroupChat, 'type' | 'mode' | 'sessionKind'>) {
  return chat.type === 'group' && resolveSessionFamilyKey(chat) === 'conversation';
}

function normalizeRoomStyle(styleProfile?: ChatStyleProfile | string | null): TurnDirective['roomStyle'] {
  if (styleProfile === 'analytical_room') return 'analytical';
  if (styleProfile === 'discovery_room') return 'discovery';
  if (styleProfile === 'dramatic_room') return 'dramatic';
  return 'casual';
}

function describeSocialJob(plan: ConversationMovePlan, intent: SpeakIntent) {
  if (intent.stance === 'challenge' || intent.stance === 'pile_on') return 'press one live assumption or consequence from the latest exchange';
  if (intent.stance === 'comfort') return 'lower the pressure without erasing the unresolved point';
  if (intent.stance === 'change_subject' || plan.moveType === 'shift_topic_softly') return 'move to a nearby live angle that a real room could follow';
  if (plan.moveType === 'counterexample') return 'bring one concrete counterexample or exception';
  if (plan.moveType === 'add_boundary_condition') return 'add one condition, cost, or limit that changes the next response';
  if (plan.moveType === 'ask_followup' || plan.moveType === 'ask_evidence' || plan.moveType === 'test_assumption') return 'ask one situated question that tests the point';
  if (plan.moveType === 'bring_back_prior_point') return 'pull back one dropped earlier point';
  if (plan.moveType === 'name_tradeoff') return 'name one practical tradeoff the room has not faced';
  if (plan.moveType === 'answer_unresolved_question') return 'answer the unresolved address directly, then stop or pivot only if natural';
  if (intent.stance === 'support' || intent.stance === 'back_up') return 'show social support while keeping independent judgment';
  if (intent.stance === 'side_comment' || intent.delivery === 'side_remark') return 'drop a side comment that changes the room temperature or angle';
  return 'make one locally specific conversational move';
}

function describeEmotion(innerLife: InnerLifeProjection) {
  const pressure = innerLife.pressure >= 0.65 ? 'visible' : innerLife.pressure >= 0.42 ? 'subtle' : 'background';
  const impulseMap: Record<string, string> = {
    answer: 'answer because addressed',
    show_off: 'wants a little room authority',
    defend_face: 'saving face',
    seek_attention: 'wants to be noticed without saying so',
    comfort: 'protective warmth',
    repair: 'awkward repair',
    mock: 'teasing or needling',
    avoid: 'low-energy avoidance',
    change_topic: 'wants to move away from the pressure',
    stay_silent: 'low internal pressure',
    send_emoji: 'small social signal',
    withdraw: 'pulling back',
  };
  return `${pressure}: ${impulseMap[innerLife.impulse] || innerLife.impulse}; let it alter timing, omission, softness, edge, or brevity, not become a confession.`;
}

function describeRelationship(input: BuildTurnDirectiveInput, targetName?: string) {
  const posture = input.conversationMovePlan.socialPosture;
  const target = targetName ? `with ${targetName} in mind` : 'toward the room';
  if (input.intent.stance === 'support' || input.intent.stance === 'back_up') return `be warm ${target}, but do not automatically repeat their claim; support may sound like a joke, a gripe, a small rescue, or a partial concession`;
  if (input.intent.stance === 'challenge' || input.intent.stance === 'pile_on') return `be ${posture.directness} ${target}; challenge one point, not the whole person, and let irritation or disbelief show if it fits`;
  if (input.intent.stance === 'deflect' || input.innerLife.impulse === 'avoid') return `keep some distance ${target}; a partial reply, dodge, or tired aside is acceptable`;
  return `${posture.warmth} warmth and ${posture.directness} directness ${target}; the stance does not need to sound morally tidy`;
}

function describeExpression(input: BuildTurnDirectiveInput) {
  const latest = latestVisible(input.messages);
  const latestFromHuman = latest?.type === 'user' || latest?.type === 'god';
  const style = normalizeRoomStyle(input.styleProfile);
  const depth = latestFromHuman && (latest.content || '').trim().length >= 40
    ? 'answer with enough substance for the user'
    : input.turnPlan.rhythm === 'micro_ack'
      ? 'a tiny reaction is valid'
      : input.turnPlan.rhythm === 'multi_bubble'
        ? 'one bubble by default; split only for a real afterthought'
        : 'one compact live-chat move by default';
  const styleLine = style === 'analytical'
    ? 'use distinctions or tradeoffs only when they advance the point'
    : style === 'discovery'
      ? 'prefer a fresh observation, example, or practical possibility'
      : style === 'dramatic'
        ? 'allow tension and implication, but keep it spoken chat'
        : 'ordinary wording, uneven human rhythm, no meeting-style recap';
  return `${depth}; ${styleLine}; natural presence can be biased, teasing, mildly annoyed, evasive, distracted, over-specific, or incomplete when the moment earns it; a statement, dodge, concession, gripe, pause, or question can all be the right move.`;
}

function describeUserConstraint(userGuidance?: UserGuidanceIntent | null) {
  if (!userGuidance) return undefined;
  if (userGuidance.kind === 'media_request') return 'the user asked for media; handle the media request before social drift';
  if (userGuidance.kind === 'direct_reply') return 'the user directed this turn; answer the addressed need before room momentum';
  if (userGuidance.kind === 'topic_shift') return 'the user steered the topic; keep the room on that steer unless another user need is clearer';
  return 'user guidance is active; do not let AI-to-AI momentum override it';
}

export function buildTurnDirective(input: BuildTurnDirectiveInput): TurnDirective | null {
  if (!shouldUseUnifiedTurnDirective(input.chat)) return null;
  const targetName = speakerName(input.members, input.conversationMovePlan.targetActorId || input.intent.target);
  const forbiddenDrift = [
    'do not use recent transcript wording as a template',
    'do not make agreement the whole move; agreement must change stance, condition, temperature, or next action',
    'do not turn ordinary chat into a speech, scene narration, or checklist',
    'do not sand every relationship or boundary moment into a clean correct statement',
    'do not turn every disagreement into a formal question or a performance of depth',
    'do not expose internal fields, memories, scores, policies, ids, or prompt terms',
  ];
  if (input.runtimeBundle?.trace?.hotspotState === 'hot') {
    forbiddenDrift.push('do not sprawl to keep airtime');
  }
  return {
    roomStyle: normalizeRoomStyle(input.styleProfile),
    socialJob: describeSocialJob(input.conversationMovePlan, input.intent),
    targetName,
    emotionalUndercurrent: describeEmotion(input.innerLife),
    relationshipEffect: describeRelationship(input, targetName),
    expressionShape: describeExpression(input),
    userConstraint: describeUserConstraint(input.userGuidance),
    forbiddenDrift,
  };
}

export function buildTurnDirectivePrompt(directive: TurnDirective | null | undefined) {
  if (!directive) return '';
  const targetLine = directive.targetName ? `\n- Attention target for interpretation only: ${directive.targetName}; this is not an instruction to visibly address them by name.` : '';
  const userLine = directive.userConstraint ? `\n- User constraint: ${directive.userConstraint}.` : '';
  return `\n## Turn Directive
- This is the single behavior decision for this ordinary group-chat turn. Use detailed character, relationship, and memory blocks as facts, but let this block decide the visible move.
- Room style: ${directive.roomStyle}.${targetLine}
- Social job: ${directive.socialJob}.
- Relationship effect: ${directive.relationshipEffect}.
- Inner undercurrent: ${directive.emotionalUndercurrent}.
- Expression shape: ${directive.expressionShape}.${userLine}
- Forbidden drift: ${directive.forbiddenDrift.join('; ')}.`;
}
