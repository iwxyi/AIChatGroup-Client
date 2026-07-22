import type { APIConfig, AIModelProfile } from '../../types/settings';
import { normalizeInternalAppHref } from '../../services/appLink';
import { executeAppCommandRoute } from '../appCommand/executeCommand';
import type { AppCommandChoice, AppCommandExecutionResult, AppCommandRoute, LocalActionPlan } from '../appCommand/commandTypes';
import { clearPendingAppCommand, getPendingAppCommand, isCancellationText, isConfirmationText } from '../appCommand/pendingCommandStore';
import { runAppCommandAgent } from '../appCommand/runCommandAgent';

function formatResult(result: AppCommandExecutionResult) {
  const candidateBlock = result.candidates?.length
    ? [
        '',
        '候选：',
        ...result.candidates.map((item, index) => `${index + 1}. ${formatOpenTarget(item.label, item.url)}${item.description ? ` - ${item.description}` : ''}`),
      ].join('\n')
    : '';
  return `${result.markdown || result.message}${candidateBlock}`;
}

function formatOpenTarget(label: string, url?: string) {
  const cleanLabel = label.trim();
  const visibleLabel = cleanLabel && !/^https?:\/\//i.test(cleanLabel) && !cleanLabel.startsWith('/') ? cleanLabel : '打开页面';
  return url ? `[${visibleLabel}](${normalizeInternalAppHref(url)})` : visibleLabel;
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
  if (choice.kind === 'cancel') return null;
  if (choice.kind === 'confirm' && !choice.plan) {
    if (baseRoute.mode !== 'local_action' && baseRoute.mode !== 'workflow') return null;
    return { ...baseRoute, requiresConfirmation: false };
  }
  if (baseRoute.mode !== 'local_action' && baseRoute.mode !== 'workflow') return null;
  if (!choice.plan?.plan && !choice.plan?.action) return null;
  const basePlan = baseRoute.mode === 'local_action'
    ? baseRoute.plan
    : choice.plan?.plan?.action
      ? choice.plan.plan as LocalActionPlan
      : null;
  if (!basePlan) return null;
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

async function executePendingChoice(params: {
  chatId: string;
  choice: AppCommandChoice;
  apiConfig: APIConfig;
  aiProfiles: AIModelProfile[];
}) {
  const scopeKey = `assistant:${params.chatId}`;
  const pending = getPendingAppCommand(scopeKey);
  if (!pending) return { title: '操作已过期', content: '这个操作已经不在等待确认了，请重新描述你的需求。' };
  clearPendingAppCommand(scopeKey);
  if (params.choice.kind === 'cancel') return { title: '已取消', content: '已取消本次操作。' };
  if (params.choice.url && !params.choice.plan) {
    return {
      title: '已找到可打开项',
      content: `可以打开：${formatOpenTarget(params.choice.label, params.choice.url)}${params.choice.description ? `\n\n${params.choice.description}` : ''}`,
    };
  }
  const choiceRoute = buildChoiceRoute(pending.route, params.choice);
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

export async function runPendingAssistantAppCommandChoice(params: {
  chatId: string;
  choiceId: string;
  apiConfig: APIConfig;
  aiProfiles: AIModelProfile[];
}) {
  const pending = getPendingAppCommand(`assistant:${params.chatId}`);
  const choice = pending?.choices?.find((item) => item.id === params.choiceId);
  if (!choice) return { title: '操作已过期', content: '这个选项已经不可用，请重新描述你的需求。' };
  return executePendingChoice({ ...params, choice });
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
      return executePendingChoice({ ...params, choice });
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
        content: `可以打开：${formatOpenTarget(candidate.label, candidate.url)}${candidate.description ? `\n\n${candidate.description}` : ''}`,
      };
    }
    if (isConfirmationText(params.input)) {
      clearPendingAppCommand(scopeKey);
      const route = pending.route.mode === 'local_action' || pending.route.mode === 'workflow'
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
  const routed = await runAppCommandAgent({
    source: 'assistant',
    chatId: params.chatId,
    input: params.input,
    apiConfig: params.apiConfig,
    aiProfiles: params.aiProfiles,
  });
  if (routed.route.mode === 'assistant_agent') return null;
  const result = routed.result;
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
