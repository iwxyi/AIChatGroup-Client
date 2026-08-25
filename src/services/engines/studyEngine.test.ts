import { describe, expect, it } from 'vitest';
import { normalizeConversation } from '../../types/chat';
import { STUDY_ENGINE } from './studyEngine';

function buildChat() {
  return normalizeConversation({
    id: 'study-engine', type: 'group', mode: 'classroom', modeConfig: {}, modeState: {},
    name: '学习进步', topic: '掌握数据库索引', style: 'free', runtimeEvolutionIntensity: 'slow',
    memberIds: ['user', 'teacher'], speed: 1, isActive: true, allowIntervention: false,
    topicSeed: '', createdAt: 1, updatedAt: 1, lastMessageAt: 1,
    sessionKind: { topology: 'group', family: 'study', scenarioId: 'learning-progress', surfaceProfile: 'hybrid' },
    scenarioState: { phase: 'mapping', learning: { goal: '掌握数据库索引', teachingMode: 'casual', knowledgeItems: [] } },
  });
}

describe('study progress engine', () => {
  it('uses learning-progress defaults and exposes learning actions', () => {
    expect(STUDY_ENGINE.createInitialConfig()).toMatchObject({ scenarioId: 'learning-progress', sessionFamily: 'study' });
    expect(STUDY_ENGINE.getAvailableActions?.().map((action) => action.type)).toEqual(['map_learning_goal', 'create_learning_practice', 'submit_learning_attempt', 'grade_learning_attempt', 'review_learning_progress']);
  });

  it('keeps teacher and student roles distinct in the group container', () => {
    const participants = STUDY_ENGINE.buildParticipants(buildChat());
    expect(participants.map((participant) => participant.roleKey)).toEqual(['student', 'teacher']);
  });

  it('does not manufacture a percentage score when a learning message is committed', () => {
    const result = STUDY_ENGINE.onMessageCommitted?.({ conversation: buildChat(), characters: [], message: { type: 'user', senderId: 'user', content: '先列出知识点' } });
    expect(result?.chatPatch.scenarioState?.progress?.[0]).toMatchObject({ label: '学习进展', target: 0 });
  });
});
