import { executeAppCommandRoute } from './executeCommand';
import { routeAppCommand } from './routeCommand';
import type { AppCommandContext, AppCommandExecutionResult, AppCommandRoute } from './commandTypes';

const MAX_AGENT_TURNS = 3;

export interface AppCommandAgentRunResult {
  route: AppCommandRoute;
  secrets: Record<string, string>;
  result: AppCommandExecutionResult;
  turns: number;
}

function shouldContinueAfterObservation(route: AppCommandRoute, result: AppCommandExecutionResult) {
  if (result.status === 'needs_confirmation') return false;
  if (route.mode === 'assistant_agent' || route.mode === 'final_response') return false;
  if (result.navigateTo) return false;
  if (result.choices?.length) return false;
  return route.mode === 'workflow';
}

function buildObservationInput(originalInput: string, route: AppCommandRoute, result: AppCommandExecutionResult) {
  return [
    '这是站内 Agent 的执行观察结果。请判断原始任务是否已经完成。',
    '如果已经完成，输出 final_response。',
    '如果还需要继续执行站内工具，输出 local_action 或 workflow。',
    '如果下一步需要生成或修改图片/文档/代码/表格/网页/图表等产物，输出 assistant_agent。',
    '',
    `原始用户请求：${originalInput}`,
    `上一轮路由：${JSON.stringify(route).slice(0, 2000)}`,
    `执行状态：${result.status}`,
    `执行标题：${result.title}`,
    `执行消息：${result.message}`,
    result.candidates?.length ? `候选：${result.candidates.map((item) => item.label).join('、')}` : '',
  ].filter(Boolean).join('\n');
}

export async function runAppCommandAgent(context: AppCommandContext): Promise<AppCommandAgentRunResult> {
  let currentInput = context.input;
  let lastRoute: AppCommandRoute | null = null;
  let lastSecrets: Record<string, string> = {};
  let lastResult: AppCommandExecutionResult | null = null;
  for (let turn = 1; turn <= MAX_AGENT_TURNS; turn += 1) {
    const routed = await routeAppCommand({ ...context, input: currentInput });
    lastRoute = routed.route;
    lastSecrets = routed.secrets;
    const result = await executeAppCommandRoute(routed.route, { ...context, input: currentInput }, routed.secrets);
    lastResult = result;
    if (!shouldContinueAfterObservation(routed.route, result)) {
      return { route: routed.route, secrets: routed.secrets, result, turns: turn };
    }
    currentInput = buildObservationInput(context.input, routed.route, result);
  }
  return {
    route: lastRoute || { mode: 'final_response', title: '已完成', message: '已完成。' },
    secrets: lastSecrets,
    result: lastResult || { status: 'info', title: '没有执行', message: '没有生成可执行计划。' },
    turns: MAX_AGENT_TURNS,
  };
}
