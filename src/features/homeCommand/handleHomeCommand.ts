import type { NavigateFunction } from 'react-router-dom';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { executeAppCommandRoute } from '../appCommand/executeCommand';
import { runAppCommandAgent } from '../appCommand/runCommandAgent';
import type { AppCommandExecutionResult, AppCommandRoute } from '../appCommand/commandTypes';
import { openAssistantFromHomeCommand } from './assistantRedirect';

export interface HomeCommandHandleResult {
  route: AppCommandRoute;
  secrets: Record<string, string>;
  result: AppCommandExecutionResult;
}

function resolveHomeArtifactMode(input: string): 'image' | 'tool' | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const hasCreateOrEditIntent = /(生成|写一份|写个|做一份|做个|制作|创建|新建|整理成|导出|修改|编辑|改成|优化|润色|翻译|总结|转换|标题|字体|排版|配色|放大|缩小|generate|create|make|write|draft|edit|update|revise|convert|export)/i.test(text);
  if (!hasCreateOrEditIntent) return null;
  if (/(图片|图像|照片|插画|海报|封面|头像|logo|配图|image|photo|poster|illustration|cover)/i.test(text)) return 'image';
  if (/(文档|报告|方案|计划书|简历|合同|表格|网页|页面|代码|脚本|图表|流程图|脑图|json|csv|markdown|ppt|word|excel|docx|xlsx|html|diagram|chart|table|document|code|webpage|file)/i.test(text)) return 'tool';
  return null;
}

export async function handleHomeCommand(input: string, navigate: NavigateFunction): Promise<HomeCommandHandleResult> {
  const artifactMode = resolveHomeArtifactMode(input);
  if (artifactMode) {
    await openAssistantFromHomeCommand(navigate, input, artifactMode);
    return {
      route: { mode: 'assistant_agent', initialMessage: input, preferredAgentMode: artifactMode, reason: 'home_artifact_task' },
      secrets: {},
      result: { status: 'success', title: '已打开助手', message: '已把这件事交给助手继续处理。' },
    };
  }
  const settings = useSettingsStore.getState();
  const context = {
    source: 'home' as const,
    input,
    navigate,
    apiConfig: settings.api,
    aiProfiles: settings.aiProfiles,
  };
  const routed = await runAppCommandAgent(context);
  if (routed.route.mode === 'assistant_agent') {
    await openAssistantFromHomeCommand(navigate, routed.route.initialMessage, routed.route.preferredAgentMode);
    return {
      ...routed,
      result: { status: 'success', title: '已打开助手', message: '已把这件事交给助手继续处理。' },
    };
  }
  const quickRoute: AppCommandRoute = (routed.route.mode === 'local_action' || routed.route.mode === 'workflow') && routed.route.riskLevel !== 'high'
    ? {
      ...routed.route,
      requiresConfirmation: false,
      confirmationText: undefined,
      choices: undefined,
      choicePresentation: undefined,
    }
    : routed.route;
  return {
    ...routed,
    route: quickRoute,
    result: await executeAppCommandRoute(quickRoute, context, routed.secrets),
  };
}

export async function confirmHomeCommand(input: string, route: AppCommandRoute, secrets: Record<string, string>, navigate: NavigateFunction) {
  const settings = useSettingsStore.getState();
  return executeAppCommandRoute(
    route.mode === 'local_action' || route.mode === 'workflow' ? { ...route, requiresConfirmation: false } : route,
    {
      source: 'home',
      input,
      navigate,
      apiConfig: settings.api,
      aiProfiles: settings.aiProfiles,
    },
    secrets,
  );
}
