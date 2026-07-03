import type { GroupChat, SessionKind } from '../types/chat';
import { resolveSessionDefinitionForConversation } from '../types/chat';

type ChatGameplayLabelInput = Pick<GroupChat, 'type' | 'mode'> & Partial<Pick<GroupChat, 'sessionKind'>>;

const SCENARIO_SHORT_LABELS = new Map<string, string>([
  ['opinion-review', '审议'],
  ['roundtable-review', '圆桌'],
  ['role-debate', '辩论'],
  ['courtroom-deliberation', '庭审'],
  ['expert-review', '评审'],
  ['public-inquiry', '问询'],
  ['brainstorm-workshop', '共创'],
  ['task-retrospective', '复盘'],
  ['story-reader', '故事'],
  ['ielts-coach', '训练'],
  ['single-agent-workflow', '任务'],
  ['multi-agent-workflow', '任务'],
  ['board-game', '桌游'],
  ['werewolf-classic', '狼人杀'],
  ['murder-mystery', '剧本'],
  ['panel-interview', '面试'],
]);

const FAMILY_SHORT_LABELS = new Map<SessionKind['family'], string>([
  ['analysis', '审议'],
  ['study', '训练'],
  ['agent', '任务'],
  ['board_game', '桌游'],
  ['deduction', '狼人杀'],
  ['mystery', '剧本'],
  ['interview', '面试'],
  ['simulation', '模拟'],
]);

const MODE_SHORT_LABELS = new Map<GroupChat['mode'], string>([
  ['group_discussion', '审议'],
  ['roundtable', '圆桌'],
  ['classroom', '训练'],
  ['agent_workflow', '任务'],
  ['board_game', '桌游'],
  ['werewolf', '狼人杀'],
  ['murder_mystery', '剧本'],
  ['interview', '面试'],
  ['scripted_play', '故事'],
]);

function isOrdinaryConversation(kind: Pick<SessionKind, 'family' | 'scenarioId'>) {
  return kind.family === 'conversation' && (kind.scenarioId === 'open-chat' || kind.scenarioId === 'direct-chat' || kind.scenarioId === 'ai-private-thread');
}

export function getChatGameplayShortLabel(chat: ChatGameplayLabelInput): string | null {
  const definition = resolveSessionDefinitionForConversation({
    type: chat.type || 'group',
    mode: chat.mode || 'open_chat',
    sessionKind: chat.sessionKind,
  });
  const kind = definition.kind;
  if (isOrdinaryConversation(kind)) return null;
  return SCENARIO_SHORT_LABELS.get(kind.scenarioId)
    || FAMILY_SHORT_LABELS.get(kind.family)
    || MODE_SHORT_LABELS.get(chat.mode)
    || null;
}
