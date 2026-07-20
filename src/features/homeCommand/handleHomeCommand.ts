import type { NavigateFunction } from 'react-router-dom';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { executeAppCommandRoute } from '../appCommand/executeCommand';
import { routeAppCommand } from '../appCommand/routeCommand';
import type { AppCommandExecutionResult, AppCommandRoute } from '../appCommand/commandTypes';
import { openAssistantFromHomeCommand } from './assistantRedirect';

export interface HomeCommandHandleResult {
  route: AppCommandRoute;
  secrets: Record<string, string>;
  result: AppCommandExecutionResult;
}

export async function handleHomeCommand(input: string, navigate: NavigateFunction): Promise<HomeCommandHandleResult> {
  const settings = useSettingsStore.getState();
  const context = {
    source: 'home' as const,
    input,
    navigate,
    apiConfig: settings.api,
    aiProfiles: settings.aiProfiles,
  };
  const routed = await routeAppCommand(context);
  if (routed.route.mode === 'assistant_agent') {
    await openAssistantFromHomeCommand(navigate, routed.route.initialMessage, routed.route.preferredAgentMode);
    return {
      ...routed,
      result: { status: 'success', title: '已打开助手', message: '已把这件事交给助手继续处理。' },
    };
  }
  return {
    ...routed,
    result: await executeAppCommandRoute(routed.route, context, routed.secrets),
  };
}

export async function confirmHomeCommand(input: string, route: AppCommandRoute, secrets: Record<string, string>, navigate: NavigateFunction) {
  const settings = useSettingsStore.getState();
  return executeAppCommandRoute(
    route.mode === 'local_action' ? { ...route, requiresConfirmation: false } : route,
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

