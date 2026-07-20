import type { APIConfig, AIModelProfile } from '../../types/settings';
import { executeAppCommandRoute } from '../appCommand/executeCommand';
import type { AppCommandChoice, AppCommandExecutionResult, AppCommandRoute, LocalActionPlan } from '../appCommand/commandTypes';
import { clearPendingAppCommand, getPendingAppCommand, isCancellationText, isConfirmationText } from '../appCommand/pendingCommandStore';
import { routeAppCommand } from '../appCommand/routeCommand';

function formatResult(result: AppCommandExecutionResult) {
  const candidateBlock = result.candidates?.length
    ? [
        '',
        '候选：',
        ...result.candidates.map((item, index) => `${index + 1}. ${item.url ? `[${item.label}](${item.url})` : item.label}${item.description ? ` - ${item.description}` : ''}`),
      ].join('\n')
    : '';
  return `${result.markdown || result.message}${candidateBlock}`;
}

function parseCandidateIndex(input: string) {
  const text = input.trim();
  const match = text.match(/(?:第\s*)?([1-9]\d*)\s*(?:个|项|号)?|打开第\s*([1-9]\d*)/);
  const raw = match?.[2] || match?.[1];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value - 1 : -1;
}

function parseChoiceId(input: string) {
  const match = input.trim().match(/^\[app-choice:([^\]]+)\]/);
  return match?.[1] || '';
}

function buildChoiceRoute(baseRoute: AppCommandRoute, choice: AppCommandChoice): AppCommandRoute | null {
  if (baseRoute.mode !== 'local_action') return null;
  if (choice.kind === 'cancel') return null;
  if (choice.kind === 'confirm' && !choice.plan) {
    return { ...baseRoute, requiresConfirmation: false };
  }
  if (!choice.plan?.plan && !choice.plan?.action) return null;
  const basePlan = baseRoute.plan;
  const nextPlan: LocalActionPlan = {
    ...basePlan,
    ...(choice.plan.plan || {}),
    action: choice.plan.action || choice.plan.plan?.action || basePlan.action,
  };
  return {
    mode: 'local_action',
    action: nextPlan.action,
    plan: nextPlan,
    riskLevel: baseRoute.riskLevel,
    requiresConfirmation: false,
  };
}

export async function tryRunAssistantAppCommand(params: {
  chatId: string;
  input: string;
  apiConfig: APIConfig;
  aiProfiles: AIModelProfile[];
}) {
  const scopeKey = `assistant:${params.chatId}`;
  const pending = getPendingAppCommand(scopeKey);
  if (pending) {
    const choiceId = parseChoiceId(params.input);
    const choice = choiceId ? pending.choices?.find((item) => item.id === choiceId) : null;
    if (choice) {
      clearPendingAppCommand(scopeKey);
      if (choice.kind === 'cancel') return { title: '已取消', content: '已取消本次操作。' };
      if (choice.url) {
        return {
          title: '已找到可打开项',
          content: `可以打开： [${choice.label}](${choice.url})${choice.description ? `\n\n${choice.description}` : ''}`,
        };
      }
      const choiceRoute = buildChoiceRoute(pending.route, choice);
      if (!choiceRoute) return { title: '无法执行选项', content: '这个选项缺少可执行计划，请重新描述你的需求。' };
      const result = await executeAppCommandRoute(
        choiceRoute,
        {
          source: 'assistant',
          chatId: params.chatId,
          input: pending.input,
          apiConfig: params.apiConfig,
          aiProfiles: params.aiProfiles,
        },
        pending.secrets,
      );
      return { title: result.title, content: formatResult(result) };
    }
    if (isCancellationText(params.input)) {
      clearPendingAppCommand(scopeKey);
      return { title: '已取消', content: '已取消刚才的站内操作计划。' };
    }
    const candidateIndex = parseCandidateIndex(params.input);
    const candidate = candidateIndex >= 0 ? pending.candidates?.[candidateIndex] : null;
    if (candidate?.url) {
      clearPendingAppCommand(scopeKey);
      return {
        title: '已找到可打开项',
        content: `可以打开： [${candidate.label}](${candidate.url})${candidate.description ? `\n\n${candidate.description}` : ''}`,
      };
    }
    if (isConfirmationText(params.input)) {
      clearPendingAppCommand(scopeKey);
      const route = pending.route.mode === 'local_action'
        ? { ...pending.route, requiresConfirmation: false }
        : pending.route;
      const result = await executeAppCommandRoute(
        route,
        {
          source: 'assistant',
          chatId: params.chatId,
          input: pending.input,
          apiConfig: params.apiConfig,
          aiProfiles: params.aiProfiles,
        },
        pending.secrets,
      );
      return {
        title: result.title,
        content: formatResult(result),
      };
    }
    return {
      title: '等待确认',
      content: [
        '上一个站内操作还在等待确认。',
        '',
        pending.route.mode === 'local_action'
          ? (pending.route.confirmationText || pending.route.plan.summary || pending.route.plan.title || '确认后我会继续执行。')
          : pending.input,
        '',
        '请选择下方操作，或回复“取消”放弃。',
      ].join('\n'),
    };
  }
  const routed = await routeAppCommand({
    source: 'assistant',
    chatId: params.chatId,
    input: params.input,
    apiConfig: params.apiConfig,
    aiProfiles: params.aiProfiles,
  });
  if (routed.route.mode !== 'local_action') return null;
  const result = await executeAppCommandRoute(
    routed.route,
    {
      source: 'assistant',
      chatId: params.chatId,
      input: params.input,
      apiConfig: params.apiConfig,
      aiProfiles: params.aiProfiles,
    },
    routed.secrets,
  );
  return {
    title: result.title,
    content: result.status === 'needs_confirmation'
      ? [
          result.message,
          '',
          '请选择下方操作，或回复“取消”放弃。',
        ].join('\n')
      : formatResult(result),
  };
}
