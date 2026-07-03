import { describe, expect, it } from 'vitest';
import { getStyleProfile, resolveDefaultStyleProfile } from './styleProfileRegistry';

describe('styleProfileRegistry', () => {
  it('keeps direct and AI-private companionship low-pressure without making it a short-answer rule', () => {
    expect(resolveDefaultStyleProfile({ scenarioId: 'direct-chat', family: 'conversation' })).toBe('companion_room');
    expect(resolveDefaultStyleProfile({ scenarioId: 'ai-private-thread', family: 'conversation' })).toBe('companion_room');

    const constraints = getStyleProfile('companion_room')?.promptContext.additionalConstraints?.join('\n') || '';

    expect(constraints).toContain('Low-pressure is about tone and consent');
    expect(constraints).toContain('not a short-answer rule');
    expect(constraints).toContain('user tasks and scene obligations still need complete answers');
  });
});
