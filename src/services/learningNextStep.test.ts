import { describe, expect, it } from 'vitest';
import { deriveLearningNextStep, recordObservedLearningEvidence } from './learningNextStep';

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
  it('records a learner mention as observed evidence without claiming mastery', () => {
    const next = recordObservedLearningEvidence({ goal: 'x', knowledgeItems: [{ id: 'a', title: '索引', status: 'exposed' }] }, '我能解释索引的作用', 1);
    expect(next.knowledgeItems[0]).toMatchObject({ status: 'practicing', evidenceCount: 1, lastReviewedAt: 1 });
    expect(next.knowledgeItems[0].notes).toContain('仍需');
  });
});
