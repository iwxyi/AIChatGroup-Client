import { describe, expect, it, vi } from 'vitest';
import type { AppCommandContext } from './commandTypes';
import { routeAppCommand } from './routeCommand';
import { generateResponse } from '../../services/aiClient';

vi.mock('../../services/aiClient', () => ({
  generateResponse: vi.fn(),
}));

const generateResponseMock = vi.mocked(generateResponse);

function context(input = '把小明调外向一点'): AppCommandContext {
  return {
    source: 'assistant',
    input,
    apiConfig: { provider: 'openai', apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model' },
    aiProfiles: [],
  };
}

describe('routeAppCommand', () => {
  it('promotes character updates to high risk even when the planner underestimates risk', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'local_action',
      action: 'update_characters',
      riskLevel: 'medium',
      requiresConfirmation: false,
      plan: {
        characterQuery: '小明',
        updateInstruction: '调外向一点',
      },
    }));

    const { route } = await routeAppCommand(context());

    expect(route.mode).toBe('local_action');
    if (route.mode !== 'local_action') return;
    expect(route.action).toBe('update_characters');
    expect(route.riskLevel).toBe('high');
    expect(route.requiresConfirmation).toBe(true);
  });

  it('promotes workflow risk when any step is high risk', async () => {
    generateResponseMock.mockResolvedValueOnce(JSON.stringify({
      mode: 'workflow',
      riskLevel: 'low',
      requiresConfirmation: false,
      steps: [
        {
          action: 'read_character_info',
          riskLevel: 'low',
          requiresConfirmation: false,
          plan: { characterQuery: '小明' },
        },
        {
          action: 'update_characters',
          riskLevel: 'medium',
          requiresConfirmation: false,
          plan: { characterQuery: '小明', updateInstruction: '调外向一点' },
        },
      ],
    }));

    const { route } = await routeAppCommand(context());

    expect(route.mode).toBe('workflow');
    if (route.mode !== 'workflow') return;
    expect(route.riskLevel).toBe('high');
    expect(route.requiresConfirmation).toBe(true);
    expect(route.steps[1]?.riskLevel).toBe('high');
  });
});
