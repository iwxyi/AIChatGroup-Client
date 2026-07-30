import { describe, expect, it } from 'vitest';
import type { AssistantAgentPatchSet } from '../types/assistantArtifact';
import type { Message } from '../types/message';
import { buildAgentArtifactReplyContent, markAssistantMediaAttachmentsFailed } from './assistantChatFlow';

describe('assistantChatFlow media artifacts', () => {
  it('does not append the same Mermaid artifact twice when the writer already included it inline', () => {
    const mermaid = [
      'flowchart TD',
      '    A[父亲] -->|夫妻| B[母亲]',
      '    A -->|父子| C[儿子]',
      '    B -->|母子| C',
      '    C -->|夫妻| D[儿媳]',
      '    C -->|父子| E[孙子]',
      '    D -->|母子| E',
    ].join('\n');
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: [
        '这是一个简单的角色关系图示例。',
        '',
        '```mermaid',
        mermaid,
        '```',
      ].join('\n'),
      patches: [{
        action: 'create',
        kind: 'diagram',
        title: '角色关系图 (Mermaid)',
        language: 'mermaid',
        content: mermaid,
      }],
      mediaTasks: [],
    };

    const content = buildAgentArtifactReplyContent(patchSet);

    expect(content.match(/```mermaid/g)?.length).toBe(1);
    expect(content).not.toContain('## 角色关系图 (Mermaid)');
  });

  it('appends artifact content when the assistant message only contains a short summary', () => {
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '已为你整理好角色关系图。',
      patches: [{
        action: 'create',
        kind: 'diagram',
        title: '角色关系图',
        language: 'mermaid',
        content: 'flowchart TD\n    A[秦始皇] -->|任用| B[李斯]\n    A -->|防范| C[赵高]',
      }],
      mediaTasks: [],
    };

    expect(buildAgentArtifactReplyContent(patchSet)).toContain('```mermaid');
  });

  it('keeps the user-facing assistant message separate from image prompts', () => {
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '我为你生成一张红烧肉照片，肥瘦相间、酱色油亮，适合直接查看。',
      patches: [],
      mediaTasks: [{
        kind: 'image',
        prompt: 'A realistic photo of Chinese braised pork belly, glossy soy caramel sauce, food photography',
        altText: '红烧肉照片',
      }],
    };

    expect(buildAgentArtifactReplyContent(patchSet)).toBe('我为你生成一张红烧肉照片，肥瘦相间、酱色油亮，适合直接查看。');
  });

  it('marks pending assistant media attachments as failed when media processing aborts unexpectedly', () => {
    const message: Message = {
      id: 'message-1',
      chatId: 'chat-1',
      type: 'ai',
      senderId: 'assistant',
      senderName: '助手',
      content: '正在生成图片，完成后会自动显示。',
      emotion: 0,
      timestamp: 1000,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'image-1',
          kind: 'image',
          status: 'queued',
          altText: '红烧肉照片',
          promptText: '红烧肉照片',
          createdAt: 1000,
          updatedAt: 1000,
        }],
        generation: {
          status: 'queued',
          updatedAt: 1000,
        },
      },
    };

    const next = markAssistantMediaAttachmentsFailed(message, new Error('生成服务异常'));

    expect(next.metadata?.attachments?.[0]).toMatchObject({
      id: 'image-1',
      status: 'failed',
      error: '生成服务异常',
    });
    expect(next.metadata?.generation?.status).toBe('failed');
  });
});
