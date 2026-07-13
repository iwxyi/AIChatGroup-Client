import { describe, expect, it } from 'vitest';
import { extractAssistantArtifactsFromMessage } from './assistantArtifactExtraction';

describe('assistantArtifactExtraction', () => {
  it('extracts multiple typed artifacts from fenced blocks', () => {
    const artifacts = extractAssistantArtifactsFromMessage([
      '这里是结果：',
      '```mermaid',
      'flowchart TD',
      '  A[开始] --> B[结束]',
      '```',
      '```html',
      '<main><h1>Hello</h1></main>',
      '```',
      '```json',
      '{"ok": true}',
      '```',
      '```csv',
      'name,value',
      'A,1',
      '```',
    ].join('\n'));

    expect(artifacts.map((item) => item.kind)).toEqual(['diagram', 'html', 'json', 'table']);
    expect(artifacts[0]).toMatchObject({
      title: 'mermaid 图表',
      language: 'mermaid',
    });
  });

  it('extracts long markdown answers as document artifacts', () => {
    const content = [
      '# 项目计划',
      '',
      '## 背景',
      '这是一段足够长的项目计划说明，用来确认普通 Markdown 文档可以被沉淀为产物，而不是只留在聊天气泡中。',
      '它需要包含多段信息，便于用户后续复制、下载、迭代和归档。',
      '',
      '## 步骤',
      '- 梳理目标',
      '- 明确边界',
      '- 拆分阶段',
      '- 验证结果',
      '',
      '## 风险',
      '需要避免把很短的普通回答误判为产物，同时保留真正可沉淀的文档。',
    ].join('\n');

    const artifacts = extractAssistantArtifactsFromMessage(content);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      kind: 'document',
      title: '项目计划',
      language: 'markdown',
    });
  });

  it('does not extract short conversational markdown as artifacts', () => {
    const artifacts = extractAssistantArtifactsFromMessage('## 结论\n\n可以，按这个方向做。');

    expect(artifacts).toEqual([]);
  });
});
