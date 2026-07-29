import { describe, expect, it, vi } from 'vitest';
import type { AppCommandContext, AppCommandRoute } from './commandTypes';
import { executeAppCommandRoute } from './executeCommand';

function context(): AppCommandContext {
  return {
    source: 'home',
    input: '小明',
    navigate: vi.fn(),
    apiConfig: { provider: 'openai', apiKey: '', baseUrl: '', model: 'test-model' },
    aiProfiles: [],
  };
}

describe('executeAppCommandRoute', () => {
  it('never auto-executes choices when planner forgets requiresConfirmation', async () => {
    const route: AppCommandRoute = {
      mode: 'local_action',
      action: 'update_theme',
      riskLevel: 'low',
      requiresConfirmation: false,
      plan: { action: 'update_theme', theme: 'dark', title: '切换主题' },
      choices: [
        {
          id: 'light',
          label: '浅色',
          kind: 'execute',
          plan: { action: 'update_theme', plan: { action: 'update_theme', theme: 'light' } },
        },
        {
          id: 'dark',
          label: '深色',
          kind: 'execute',
          plan: { action: 'update_theme', plan: { action: 'update_theme', theme: 'dark' } },
        },
      ],
    };

    const result = await executeAppCommandRoute(route, context());

    expect(result.status).toBe('needs_confirmation');
    expect(result.choices?.map((choice) => choice.id)).toEqual(['light', 'dark']);
  });
});
