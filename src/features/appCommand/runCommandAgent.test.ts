import { describe, expect, it } from 'vitest';
import type { AppCommandExecutionResult, AppCommandRoute } from './commandTypes';
import { shouldContinueAfterObservation } from './runCommandAgent';

const localRoute: AppCommandRoute = {
  mode: 'local_action',
  action: 'open_existing_chat',
  plan: { action: 'open_existing_chat', chatQuery: '秦始皇', chatTypePreference: 'direct' },
  riskLevel: 'low',
  requiresConfirmation: false,
};

function result(patch: Partial<AppCommandExecutionResult>): AppCommandExecutionResult {
  return {
    status: 'info',
    title: '观察',
    message: '观察结果',
    ...patch,
  };
}

describe('shouldContinueAfterObservation', () => {
  it('continues after recoverable local action observations', () => {
    expect(shouldContinueAfterObservation(localRoute, result({
      recoverable: true,
      reasonType: 'chat_not_found',
      observation: { possibleNextActions: ['create_direct_chat'] },
    }))).toBe(true);
  });

  it('stops when execution needs user confirmation', () => {
    expect(shouldContinueAfterObservation(localRoute, result({
      status: 'needs_confirmation',
      choices: [{ id: 'a', label: '打开', kind: 'execute' }],
    }))).toBe(false);
  });

  it('stops after navigation succeeds', () => {
    expect(shouldContinueAfterObservation(localRoute, result({
      status: 'success',
      navigateTo: '/chats/local-chat-1',
    }))).toBe(false);
  });
});
