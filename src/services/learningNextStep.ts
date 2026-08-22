import type { LearningKnowledgeItem, LearningNextStepSuggestion, LearningScenarioState } from '../types/chat';

function count(items: LearningKnowledgeItem[], status: LearningKnowledgeItem['status']) {
  return items.filter((item) => item.status === status).length;
}

export function deriveLearningNextStep(learning: LearningScenarioState, now = Date.now()): LearningNextStepSuggestion {
  const items = learning.knowledgeItems || [];
  const stale = count(items, 'stale');
  const exposed = count(items, 'exposed') + count(items, 'unknown');
  const practicing = count(items, 'practicing') + count(items, 'learning');
  if (!items.length) {
    return { action: 'map', title: '先建立知识点地图', reason: '当前还没有可追踪的知识点记录。', prompt: `请围绕“${learning.goal}”整理一份分层知识点地图，并标出先后顺序。`, generatedAt: now };
  }
  if (stale > 0) {
    return { action: 'review', title: '优先复习已过期知识点', reason: `有 ${stale} 个知识点到了复习窗口或已被标记为过期。`, prompt: '请根据学习记录安排一次间隔复习，先处理最久未复习的知识点。', generatedAt: now };
  }
  if (practicing > 0) {
    return { action: 'practice', title: '用小练习验证正在学习的内容', reason: `有 ${practicing} 个知识点正在学习或练习中，尚缺少新的可观察证据。`, prompt: '请生成一组短练习，只覆盖当前学习中的知识点，并在结束后记录每题证据。', generatedAt: now };
  }
  if (exposed > 0) {
    return { action: 'practice', title: '把已整理内容转成主动练习', reason: `有 ${exposed} 个知识点已经出现，但还没有足够的练习证据。`, prompt: '请把尚未验证的知识点转成一份小测或 HTML 练习，不要直接宣称已经掌握。', generatedAt: now };
  }
  return { action: 'record', title: '记录一次新的学习证据', reason: '当前知识点没有明显的复习阻塞，适合补充最近一次学习表现。', prompt: '请让我用一句话记录刚才能独立完成的内容、仍然卡住的地方和下一次复习时间。', generatedAt: now };
}
