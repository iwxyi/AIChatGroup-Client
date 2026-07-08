import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import type { CompanionshipPhase, CompanionshipPhaseEventPayload, CompanionshipStyle } from '../types/companionship';
import type { Message } from '../types/message';
import type { RuntimeEventV2 } from '../types/runtimeEvent';
import type { APIConfig } from '../types/settings';
import { generateJsonResponse } from './aiClient';
import { reportRecoverableWarning } from './diagnostics';

function compactPhaseEvidence(text: string, max = 120) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

type PhaseDecisionSource = 'model';
export type CompanionshipPhaseDecision = {
  phase: CompanionshipPhase;
  style?: CompanionshipStyle;
  reason: string;
  confidence: number;
  evidence: string[];
  decisionSource: PhaseDecisionSource;
};

const PHASES: CompanionshipPhase[] = ['stranger', 'curious', 'fond', 'ambiguous', 'confessing', 'confirmed', 'passionate', 'deep', 'cooling', 'crisis', 'reconciling'];
const STYLES: CompanionshipStyle[] = ['romantic', 'ambiguous', 'friend', 'family', 'mentor', 'custom'];

function isCompanionshipPhase(value: unknown): value is CompanionshipPhase {
  return typeof value === 'string' && PHASES.includes(value as CompanionshipPhase);
}

function isCompanionshipStyle(value: unknown): value is CompanionshipStyle {
  return typeof value === 'string' && STYLES.includes(value as CompanionshipStyle);
}

function cleanJsonCandidate(raw: string) {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const object = text.match(/\{[\s\S]*\}/);
  return object?.[0] || text;
}

function normalizeModelDecision(raw: unknown, userContent: string): CompanionshipPhaseDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const shouldCreate = value.shouldCreate === true;
  if (!shouldCreate) return null;
  if (!isCompanionshipPhase(value.phase)) return null;
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
    ? Math.max(0, Math.min(1, value.confidence > 1 ? value.confidence / 100 : value.confidence))
    : 0;
  if (confidence < 0.7) return null;
  const reason = typeof value.reason === 'string' ? compactPhaseEvidence(value.reason, 140) : '';
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => compactPhaseEvidence(item, 120)).slice(0, 3)
    : [];
  return {
    phase: value.phase,
    style: isCompanionshipStyle(value.style) ? value.style : undefined,
    reason: reason || '模型判断用户明确表达了关系阶段变化。',
    confidence,
    evidence: evidence.length ? evidence : [compactPhaseEvidence(userContent)],
    decisionSource: 'model',
  };
}

async function judgeCompanionshipPhaseWithModel(params: {
  config: APIConfig;
  chat: GroupChat;
  character: AICharacter;
  message: Message;
  recentMessages?: Message[];
}): Promise<CompanionshipPhaseDecision | null> {
  const recentTranscript = (params.recentMessages || [])
    .filter((item) => !item.isDeleted && item.type !== 'system' && item.type !== 'event')
    .slice(-8)
    .map((item) => `${item.senderName || item.senderId}: ${compactPhaseEvidence(item.content, 160)}`)
    .join('\n');
  const systemPrompt = [
    '你是亲密陪伴运行时的关系阶段裁决器。',
    '任务：判断“用户这一条新消息”是否明确产生了用户-角色关系阶段事件。',
    '必须保守：普通玩笑、假设、角色扮演台词、讨论别人关系、泛泛喜欢、日常冷静诉求、普通不舒服，都不要创建事件。',
    '只有用户明确把自己和当前角色的关系推进/降级/修复时才 shouldCreate=true。',
    'confirmed 必须是明确确认恋人/对象/情侣等关系边界；confessing 是明确表白但未确认；passionate 是确认关系后用户明确表达高频陪伴、热恋式靠近或强烈想念；deep 是长期稳定、信任、共同承诺或成熟陪伴被明确说出；cooling 是用户明确降温、疏离、想减少互动但未到危机；crisis 是明确受伤、暂停或关系危机；reconciling 是明确和好或修复。',
    '返回 JSON: {"shouldCreate":boolean,"phase":"confessing|confirmed|passionate|deep|cooling|crisis|reconciling|none","style":"romantic|ambiguous|friend|family|mentor|custom|null","confidence":number,"reason":"...","evidence":["..."]}',
    'confidence 取 0-1。拿不准必须 shouldCreate=false 或 confidence<0.7。',
  ].join('\n');
  const payload = {
    chatName: params.chat.name,
    character: {
      id: params.character.id,
      name: params.character.name,
      background: params.character.background || '',
      speakingStyle: params.character.speakingStyle || '',
    },
    recentTranscript,
    userMessage: params.message.content,
  };
  const raw = await generateJsonResponse(params.config, systemPrompt, [{ role: 'user', content: JSON.stringify(payload) }], {
    aiUsage: { type: 'companionship_phase', label: '陪伴阶段分析', scope: 'chat', resourceId: params.chat.id },
  });
  const parsed = JSON.parse(cleanJsonCandidate(raw)) as unknown;
  return normalizeModelDecision(parsed, params.message.content);
}

export function buildCompanionshipPhaseEventFromDecision(params: {
  chat: GroupChat;
  character: AICharacter;
  message: Message;
  decision: CompanionshipPhaseDecision;
}): RuntimeEventV2 | null {
  if (params.chat.type !== 'direct') return null;
  const payload: CompanionshipPhaseEventPayload = {
    eventType: 'companionship_phase_event',
    characterId: params.character.id,
    userId: 'user',
    phase: params.decision.phase,
    style: params.decision.style,
    reason: params.decision.reason,
    initiatedBy: 'user',
    evidence: params.decision.evidence,
    sourceMessageIds: [params.message.id],
    confidence: params.decision.confidence,
    decisionSource: params.decision.decisionSource,
  };
  return {
    id: `evt-companionship-phase-${params.message.id}`,
    conversationId: params.chat.id,
    kind: 'phase_transition',
    createdAt: params.message.timestamp || Date.now(),
    actorIds: ['user'],
    targetIds: [params.character.id],
    evidenceMessageIds: [params.message.id],
    summary: params.decision.reason,
    eventClass: 'phase',
    visibility: 'pair_private',
    payload,
  };
}

export function buildCompanionshipPhaseEventFromDirectUserMessage(params: {
  chat: GroupChat;
  character: AICharacter;
  message: Message;
}): RuntimeEventV2 | null {
  void params;
  return null;
}

export async function resolveCompanionshipPhaseEventFromDirectUserMessage(params: {
  chat: GroupChat;
  character: AICharacter;
  message: Message;
  textApiConfig?: APIConfig | null;
  recentMessages?: Message[];
}): Promise<RuntimeEventV2 | null> {
  if (params.chat.type !== 'direct') return null;
  if (params.textApiConfig) {
    try {
      const decision = await judgeCompanionshipPhaseWithModel({
        config: params.textApiConfig,
        chat: params.chat,
        character: params.character,
        message: params.message,
        recentMessages: params.recentMessages,
      });
      if (decision) return buildCompanionshipPhaseEventFromDecision({ ...params, decision });
      return null;
    } catch (error) {
      reportRecoverableWarning({
        location: 'companionship:phase-model',
        error,
        message: '关系阶段模型裁决失败，已跳过本轮关系阶段写入。',
        extra: {
          chatId: params.chat.id,
          characterId: params.character.id,
          messageId: params.message.id,
          messagePreview: compactPhaseEvidence(params.message.content, 80),
        },
      });
      return null;
    }
  }
  return null;
}
