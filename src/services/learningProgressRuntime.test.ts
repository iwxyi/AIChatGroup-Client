import { describe, expect, it } from 'vitest';
import { normalizeConversation } from '../types/chat';
import { mergeLearningKnowledgeFromArtifacts } from './learningProgressRuntime';

const chat = normalizeConversation({
  id: 'learning-1', type: 'group', mode: 'classroom', modeConfig: {}, modeState: {},
  name: '学习进步', topic: '掌握数据库索引', style: 'free', runtimeEvolutionIntensity: 'slow',
  memberIds: ['user', 'teacher'], speed: 1, isActive: true, allowIntervention: false,
  topicSeed: '', createdAt: 1, updatedAt: 1, lastMessageAt: 1,
  sessionKind: { topology: 'group', family: 'study', scenarioId: 'learning-progress', surfaceProfile: 'hybrid' },
  scenarioState: { learning: { goal: '掌握数据库索引', knowledgeItems: [] } },
});

describe('learning progress runtime', () => {
  it('projects headings from generated study artifacts into knowledge state', () => {
    const patch = mergeLearningKnowledgeFromArtifacts(chat, [{
      id: 'artifact-1', chatId: chat.id, kind: 'document', title: '数据库索引知识地图', currentVersionId: 'v1', sourceMessageId: 'm1', createdAt: 1, updatedAt: 1,
      versions: [{ id: 'v1', artifactId: 'artifact-1', sourceMessageId: 'm1', createdAt: 1, content: '# 索引基础\n## B+树\n## 覆盖索引' }],
    }]);
    expect(patch.scenarioState?.learning?.knowledgeItems.map((item) => item.title)).toEqual(['索引基础', 'B+树', '覆盖索引']);
  });
});
