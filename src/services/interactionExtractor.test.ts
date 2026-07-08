import { describe, expect, it } from 'vitest';
import type { AICharacter } from '../types/character';
import { extractInteractionEvent } from './interactionExtractor';

const characters = [
  { id: 'a', name: '小甲' },
  { id: 'b', name: '小乙' },
] as AICharacter[];

describe('interactionExtractor', () => {
  it('does not treat generic agreement words as relationship support', () => {
    const event = extractInteractionEvent({
      message: {
        senderId: 'a',
        content: '小乙刚才说到的合租成本确实是个问题，但我想再拆一个前提。',
      },
      characters,
    });

    expect(event).toBeNull();
  });

  it('does not infer explicit person-directed backing without model-authored interaction data', () => {
    const event = extractInteractionEvent({
      message: {
        senderId: 'a',
        content: '小乙，你说得对，我支持你把这个成本讲清楚。',
      },
      characters,
    });

    expect(event).toBeNull();
  });
});
