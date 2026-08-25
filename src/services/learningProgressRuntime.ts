import type { GroupChat, LearningAttemptRecord, LearningEvidenceRecord, LearningKnowledgeItem } from '../types/chat';
import type { AssistantArtifactItem } from '../types/assistantArtifact';
import { deriveLearningNextStep } from './learningNextStep';

function currentContent(item: AssistantArtifactItem) {
  const version = item.versions.find((entry) => entry.id === item.currentVersionId) || item.versions.at(-1);
  return version?.content || version?.files?.[0]?.content || '';
}

function titleFromArtifact(item: AssistantArtifactItem) {
  return item.title.trim() || '未命名学习资料';
}

function extractKnowledgeItems(artifacts: AssistantArtifactItem[]): LearningKnowledgeItem[] {
  const items: LearningKnowledgeItem[] = [];
  for (const artifact of artifacts.filter((entry) => entry.deletedAt == null).slice(0, 24)) {
    const content = currentContent(artifact);
    let headings = Array.from(content.matchAll(/^#{1,3}\s+(.+)$/gm)).map((match) => match[1].trim()).filter(Boolean);
    if (!headings.length && (artifact.kind === 'json' || artifact.kind === 'table')) {
      try {
        const parsed = JSON.parse(content) as unknown;
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        headings = rows.flatMap((row) => row && typeof row === 'object' && typeof (row as Record<string, unknown>).title === 'string' ? [String((row as Record<string, unknown>).title)] : []);
      } catch { /* malformed artifact is not a knowledge source */ }
    }
    if (!headings.length) headings = [titleFromArtifact(artifact)];
    headings.slice(0, 32).forEach((title, index) => {
      const id = `knowledge:${artifact.id}:${index}`;
      items.push({ id, title, status: 'exposed', evidenceCount: 0, sourceArtifactIds: [artifact.id] });
    });
  }
  return Array.from(new Map(items.map((item) => [item.title.toLocaleLowerCase(), item])).values()).slice(0, 120);
}

export function mergeLearningKnowledgeFromArtifacts(chat: GroupChat, artifacts: AssistantArtifactItem[]): Partial<GroupChat> {
  const previous = chat.scenarioState?.learning;
  const extracted = extractKnowledgeItems(artifacts);
  if (!previous || !extracted.length) return {};
  const existing = new Map(previous.knowledgeItems.map((item) => [item.title.toLocaleLowerCase(), item]));
  extracted.forEach((item) => {
    const old = existing.get(item.title.toLocaleLowerCase());
    existing.set(item.title.toLocaleLowerCase(), old ? { ...item, ...old, sourceArtifactIds: Array.from(new Set([...(old.sourceArtifactIds || []), ...(item.sourceArtifactIds || [])])) } : item);
  });
  const nextLearning = { ...previous, knowledgeItems: Array.from(existing.values()).slice(0, 120), lastStudyAction: 'map' as const };
  return { scenarioState: { ...(chat.scenarioState || {}), learning: { ...nextLearning, nextStepSuggestion: deriveLearningNextStep(nextLearning) } } };
}

export function recordLearningEvidence(chat: GroupChat, evidence: LearningEvidenceRecord): Partial<GroupChat> {
  const learning = chat.scenarioState?.learning;
  if (!learning) return {};
  const evidenceItems = [...(learning.evidence || []).filter((item) => item.id !== evidence.id), evidence].slice(-240);
  const linkedIds = new Set(evidence.knowledgeItemIds || []);
  const knowledgeItems = learning.knowledgeItems.map((item) => linkedIds.has(item.id)
    ? { ...item, evidenceCount: (item.evidenceCount || 0) + 1, lastReviewedAt: evidence.createdAt, status: item.status === 'unknown' || item.status === 'exposed' ? 'practicing' as const : item.status }
    : item);
  const nextLearning = { ...learning, evidence: evidenceItems, knowledgeItems };
  return { scenarioState: { ...(chat.scenarioState || {}), learning: { ...nextLearning, nextStepSuggestion: deriveLearningNextStep(nextLearning) } } };
}

export function recordLearningAttempt(chat: GroupChat, attempt: LearningAttemptRecord): Partial<GroupChat> {
  const learning = chat.scenarioState?.learning;
  if (!learning) return {};
  const attempts = [...(learning.attempts || []).filter((item) => item.id !== attempt.id), attempt].slice(-120);
  const nextLearning = { ...learning, attempts, lastStudyAction: attempt.status === 'graded' ? 'review' as const : 'practice' as const, lastStudyActionAt: attempt.createdAt };
  return { scenarioState: { ...(chat.scenarioState || {}), learning: { ...nextLearning, nextStepSuggestion: deriveLearningNextStep(nextLearning) } } };
}

export function buildLearningProgressSnapshot(chat: GroupChat) {
  const learning = chat.scenarioState?.learning;
  if (!learning) return null;
  const items = learning.knowledgeItems || [];
  return {
    goal: learning.goal,
    counts: items.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {}),
    recentEvidence: (learning.evidence || []).slice(-8),
    recentAttempts: (learning.attempts || []).slice(-8),
    nextStep: learning.nextStepSuggestion || deriveLearningNextStep(learning),
  };
}
