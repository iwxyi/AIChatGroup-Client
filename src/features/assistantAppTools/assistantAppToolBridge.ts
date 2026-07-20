import type { APIConfig, AIModelProfile } from '../../types/settings';
import { executeAppCommandRoute } from '../appCommand/executeCommand';
import { routeAppCommand } from '../appCommand/routeCommand';

export async function tryRunAssistantAppCommand(params: {
  input: string;
  apiConfig: APIConfig;
  aiProfiles: AIModelProfile[];
}) {
  const routed = await routeAppCommand({
    source: 'assistant',
    input: params.input,
    apiConfig: params.apiConfig,
    aiProfiles: params.aiProfiles,
  });
  if (routed.route.mode !== 'local_action') return null;
  if (routed.route.requiresConfirmation) {
    return {
      title: routed.route.plan.title || '需要确认',
      content: [
        routed.route.confirmationText || routed.route.plan.summary || '我可以执行这个站内操作，但需要你确认后再继续。',
        '',
        '确认后我会继续执行，并把结果链接发给你。',
      ].join('\n'),
    };
  }
  const result = await executeAppCommandRoute(
    routed.route,
    {
      source: 'assistant',
      input: params.input,
      apiConfig: params.apiConfig,
      aiProfiles: params.aiProfiles,
    },
    routed.secrets,
  );
  return {
    title: result.title,
    content: result.markdown || result.message,
  };
}

