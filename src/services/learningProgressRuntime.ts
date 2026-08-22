import type { GroupChat, LearningKnowledgeItem } from '../types/chat';
import type { AssistantArtifactItem } from '../types/assistantArtifact';

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
  return { scenarioState: { ...(chat.scenarioState || {}), learning: { ...previous, knowledgeItems: Array.from(existing.values()).slice(0, 120) } } };
}
