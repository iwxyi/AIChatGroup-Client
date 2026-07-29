import { executeAppCommandRoute } from './executeCommand';
import { routeAppCommand } from './routeCommand';
import type { AppCommandContext, AppCommandExecutionResult, AppCommandRoute } from './commandTypes';

const MAX_AGENT_TURNS = 5;

export interface AppCommandAgentRunResult {
  route: AppCommandRoute;
  secrets: Record<string, string>;
  result: AppCommandExecutionResult;
  turns: number;
}

function routeSignature(route: AppCommandRoute) {
  if (route.mode === 'local_action') {
    return JSON.stringify({
      mode: route.mode,
      action: route.action,
      plan: route.plan,
    });
  }
  if (route.mode === 'workflow') {
    return JSON.stringify({
      mode: route.mode,
      steps: route.steps.map((step) => ({ action: step.action, plan: step.plan })),
    });
  }
  return JSON.stringify({ mode: route.mode });
}

function summarizeAttemptHistory(history: Array<{ route: AppCommandRoute; result: AppCommandExecutionResult }>) {
  return history.map((item, index) => ({
    turn: index + 1,
    routeMode: item.route.mode,
    action: item.route.mode === 'local_action'
      ? item.route.action
      : item.route.mode === 'workflow'
        ? item.route.steps.map((step) => step.action).join(' -> ')
        : item.route.mode,
    status: item.result.status,
    reasonType: item.result.reasonType,
    recoverable: Boolean(item.result.recoverable),
    title: item.result.title,
  }));
}

export function shouldContinueAfterObservation(route: AppCommandRoute, result: AppCommandExecutionResult) {
  if (result.status === 'needs_confirmation') return false;
  if (route.mode === 'assistant_agent' || route.mode === 'final_response') return false;
  if (result.navigateTo) return false;
  if (result.choices?.length) return false;
  if (result.recoverable) return true;
  return route.mode === 'workflow';
}

function buildObservationInput(
  originalInput: string,
  route: AppCommandRoute,
  result: AppCommandExecutionResult,
  history: Array<{ route: AppCommandRoute; result: AppCommandExecutionResult }>,
) {
  return [
    '这是站内 Agent 的执行观察结果。你必须围绕原始用户目标继续判断，而不是围绕上一轮工具是否成功。',
    '请重新推理：originalGoal 是否已经达成？如果没有，当前 observation 暴露了什么缺口？下一步应使用哪个可用工具推进目标？',
    '如果已经完成，输出 final_response。',
    '如果还需要继续执行站内工具，输出 local_action 或 workflow。',
    '如果下一步需要生成或修改图片/文档/代码/表格/网页/图表等产物，输出 assistant_agent。',
    '如果上一轮工具未命中但 recoverable=true，说明目标尚未失败；请结合 observation.possibleNextActions、工具能力和风险边界自主选择下一步。不要把“没找到”直接当最终回复。',
    '',
    `originalGoal：${originalInput}`,
    `上一轮路由：${JSON.stringify(route).slice(0, 2000)}`,
    `执行状态：${result.status}`,
    `执行标题：${result.title}`,
    `执行消息：${result.message}`,
    result.reasonType ? `失败/阻塞类型：${result.reasonType}` : '',
    result.recoverable ? '是否可继续规划：true' : '',
    result.observation ? `结构化观察：${JSON.stringify(result.observation).slice(0, 3000)}` : '',
    history.length ? `已尝试动作历史：${JSON.stringify(summarizeAttemptHistory(history)).slice(0, 2500)}` : '',
    '不要重复执行已证明无收益的同参数动作；如果缺少关键信息，请澄清；如果有不同工具能推进目标，请选择不同工具。',
    result.candidates?.length ? `候选：${result.candidates.map((item) => item.label).join('、')}` : '',
  ].filter(Boolean).join('\n');
}

export async function runAppCommandAgent(context: AppCommandContext): Promise<AppCommandAgentRunResult> {
  let currentInput = context.input;
  let lastRoute: AppCommandRoute | null = null;
  let lastSecrets: Record<string, string> = {};
  let lastResult: AppCommandExecutionResult | null = null;
  const attemptedSignatures = new Set<string>();
  const history: Array<{ route: AppCommandRoute; result: AppCommandExecutionResult }> = [];
  for (let turn = 1; turn <= MAX_AGENT_TURNS; turn += 1) {
    const routed = await routeAppCommand({ ...context, input: currentInput });
    const signature = routeSignature(routed.route);
    if (attemptedSignatures.has(signature)) {
      return {
        route: routed.route,
        secrets: routed.secrets,
        result: {
          status: 'needs_confirmation',
          title: '需要更多信息',
          message: '我已经尝试过同样的步骤，但没有推进目标。请补充更明确的对象、范围或执行方式。',
          reasonType: 'repeated_no_progress_action',
          observation: { attemptedHistory: summarizeAttemptHistory(history) },
        },
        turns: turn,
      };
    }
    attemptedSignatures.add(signature);
    lastRoute = routed.route;
    lastSecrets = routed.secrets;
    const result = await executeAppCommandRoute(routed.route, { ...context, input: currentInput }, routed.secrets);
    lastResult = result;
    history.push({ route: routed.route, result });
    if (!shouldContinueAfterObservation(routed.route, result)) {
      return { route: routed.route, secrets: routed.secrets, result, turns: turn };
    }
    currentInput = buildObservationInput(context.input, routed.route, result, history);
  }
  return {
    route: lastRoute || { mode: 'final_response', title: '已完成', message: '已完成。' },
    secrets: lastSecrets,
    result: lastResult || { status: 'info', title: '没有执行', message: '没有生成可执行计划。' },
    turns: MAX_AGENT_TURNS,
  };
}
