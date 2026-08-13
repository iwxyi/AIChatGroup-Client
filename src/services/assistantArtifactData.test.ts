import { describe, expect, it } from 'vitest';
import type { AssistantArtifactItem } from '../types/assistantArtifact';
import { applyAssistantArtifactDataOperation, summarizeAssistantArtifactData } from './assistantArtifactData';

function table(content: string): AssistantArtifactItem {
  return {
    id: 'words',
    chatId: 'chat-a',
    kind: 'table',
    title: '英语单词背诵记录',
    currentVersionId: 'v1',
    sourceMessageId: 'm1',
    createdAt: 1,
    updatedAt: 1,
    versions: [{ id: 'v1', artifactId: 'words', content, sourceMessageId: 'm1', createdAt: 1 }],
  };
}

describe('assistant artifact data operations', () => {
  it('summarizes CSV schema without returning the full file', () => {
    const summary = summarizeAssistantArtifactData(table('word,lastReviewed,reviewCount\nserendipity,2026-07-01,3\n'));
    expect(summary).toMatchObject({ format: 'csv', rowCount: 1, columns: ['word', 'lastReviewed', 'reviewCount'] });
    expect(summary?.sampleRows).toEqual([{ word: 'serendipity', lastReviewed: '2026-07-01', reviewCount: '3' }]);
  });

  it('supports numeric and date conditions with a capped query result', () => {
    const rows = Array.from({ length: 105 }, (_, index) => `word-${index},2026-06-01,${index}`).join('\n');
    const applied = applyAssistantArtifactDataOperation(table(`word,lastReviewed,reviewCount\n${rows}`), {
      kind: 'query', artifactId: 'words', filter: [
        { field: 'lastReviewed', operator: 'lt', value: '2026-07-01' },
        { field: 'reviewCount', operator: 'lt', value: 10 },
      ], limit: 300,
    }, 2);
    expect(applied.result.totalRows).toBe(10);
    expect(applied.result.rows).toHaveLength(10);
    expect(applied.result.truncated).toBe(false);
  });

  it('creates a new version for update and preserves CSV columns', () => {
    const applied = applyAssistantArtifactDataOperation(table('word,reviewCount\nhello,1\n'), {
      kind: 'update', artifactId: 'words', baseVersionId: 'v1',
      filter: [{ field: 'word', value: 'hello' }], values: { reviewCount: 2 },
    }, 2);
    expect(applied.result.affectedRows).toBe(1);
    expect(applied.item.versions).toHaveLength(2);
    expect(applied.item.currentVersionId).not.toBe('v1');
    expect(applied.item.versions.at(-1)?.content).toContain('hello,2');
  });

  it('marks JSON query results as JSON for the chat renderer', () => {
    const item = { ...table('[{"id":1,"value":"a"}]'), kind: 'json' as const };
    const applied = applyAssistantArtifactDataOperation(item, { kind: 'query', artifactId: 'words' }, 2);
    expect(applied.result.format).toBe('json');
    expect(applied.result.columns).toEqual(['id', 'value']);
  });
});
