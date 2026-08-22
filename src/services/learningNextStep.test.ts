import { describe, expect, it } from 'vitest';
import { deriveLearningNextStep } from './learningNextStep';

describe('deriveLearningNextStep', () => {
  it('starts with mapping when there is no knowledge map', () => {
    expect(deriveLearningNextStep({ goal: '掌握数据库索引', knowledgeItems: [] }, 1).action).toBe('map');
  });
  it('prioritizes stale evidence over new practice', () => {
    expect(deriveLearningNextStep({ goal: 'x', knowledgeItems: [{ id: 'a', title: 'a', status: 'stale' }, { id: 'b', title: 'b', status: 'exposed' }] }, 1)).toMatchObject({ action: 'review' });
  });
  it('suggests practice for exposed knowledge', () => {
    expect(deriveLearningNextStep({ goal: 'x', knowledgeItems: [{ id: 'a', title: 'a', status: 'exposed' }] }, 1)).toMatchObject({ action: 'practice', prompt: expect.stringContaining('练习') });
  });
});
