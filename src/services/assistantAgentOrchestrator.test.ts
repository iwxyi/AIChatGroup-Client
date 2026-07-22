import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantAgentChangePlan, AssistantAgentPatchSet, AssistantArtifactItem } from '../types/assistantArtifact';
import type { Message } from '../types/message';
import {
  buildCompactImageAttachmentRefs,
  buildCompactImageReferenceRegistry,
  validateAssistantAgentPatchSet,
  writeAssistantAgentPatchSet,
} from './assistantAgentOrchestrator';

const generateResponseMock = vi.hoisted(() => vi.fn());

vi.mock('./aiClient', () => ({
  generateResponse: (...args: unknown[]) => generateResponseMock(...args),
}));

function artifact(overrides: Partial<AssistantArtifactItem> = {}): AssistantArtifactItem {
  return {
    id: 'artifact-a',
    chatId: 'chat-a',
    kind: 'diagram',
    title: '注册流程',
    summary: '注册流程图',
    language: 'mermaid',
    currentVersionId: 'version-a',
    sourceMessageId: 'message-a',
    createdAt: 1,
    updatedAt: 1,
    versions: [{
      id: 'version-a',
      artifactId: 'artifact-a',
      content: 'flowchart TD\nA-->B',
      language: 'mermaid',
      sourceMessageId: 'message-a',
      createdAt: 1,
    }],
    deletedAt: null,
    ...overrides,
  };
}

describe('assistantAgentOrchestrator validation', () => {
  beforeEach(() => {
    generateResponseMock.mockReset();
  });

  it('keeps data URL images out of text model payload references', () => {
    const message: Message = {
      id: 'message-image',
      chatId: 'chat-a',
      type: 'user',
      senderId: 'user',
      senderName: '用户',
      content: '参考这张图',
      emotion: 0,
      timestamp: 1,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'att-image',
          kind: 'image',
          status: 'ready',
          altText: '参考图',
          caption: '参考图说明',
          url: `data:image/png;base64,${'A'.repeat(4096)}`,
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
          sizeBytes: 4096,
          createdAt: 1,
          updatedAt: 1,
        }],
      },
    };

    expect(buildCompactImageAttachmentRefs(message)).toEqual([{
      id: 'att-image',
      messageId: 'message-image',
      refId: 'message-image:att-image',
      mimeType: 'image/png',
      altText: '参考图',
      caption: '参考图说明',
      width: 1024,
      height: 1024,
      sizeBytes: 4096,
      urlKind: 'data',
    }]);
    expect(JSON.stringify(buildCompactImageAttachmentRefs(message))).not.toContain('data:image');
  });

  it('builds a lightweight image reference registry independent of text history', () => {
    const imageOnlyMessage: Message = {
      id: 'message-image-only',
      chatId: 'chat-a',
      type: 'ai',
      senderId: 'assistant',
      senderName: '助手',
      content: '',
      emotion: 0,
      timestamp: 20,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'att-latest',
          kind: 'image',
          status: 'ready',
          altText: '上一张生成图',
          url: `data:image/png;base64,${'B'.repeat(4096)}`,
          mimeType: 'image/png',
          createdAt: 20,
          updatedAt: 20,
        }],
      },
    };
    const olderMessage: Message = {
      ...imageOnlyMessage,
      id: 'message-older',
      content: '旧参考图',
      timestamp: 10,
      metadata: {
        attachments: [{
          id: 'att-older',
          kind: 'image',
          status: 'ready',
          altText: '旧参考图',
          url: 'https://example.test/older.png',
          mimeType: 'image/png',
          createdAt: 10,
          updatedAt: 10,
        }],
      },
    };

    const registry = buildCompactImageReferenceRegistry([olderMessage, imageOnlyMessage]);

    expect(registry.map((item) => item.refId)).toEqual([
      'message-image-only:att-latest',
      'message-older:att-older',
    ]);
    expect(registry[0]).toMatchObject({
      messageRole: 'assistant',
      messageContentPreview: '',
      urlKind: 'data',
    });
    expect(JSON.stringify(registry)).not.toContain('data:image');
  });

  it('expands terse image media prompts before dispatching image generation', async () => {
    generateResponseMock.mockResolvedValue(JSON.stringify({
      assistantMessage: '下面是三张图。',
      patches: [],
      mediaTasks: [{
        kind: 'image',
        slotId: 'image-1',
        userCaption: '番茄炒蛋',
        prompt: '番茄炒蛋',
        altText: '番茄炒蛋',
      }],
    }));
    const plan: AssistantAgentChangePlan = {
      intent: 'create',
      scope: { targetMode: 'unknown', artifactIds: [] },
      operations: [{ kind: 'create', instruction: '生成图片' }],
      requiresConfirmation: false,
      confidence: 0.95,
    };
    const userMessage: Message = {
      id: 'message-image',
      chatId: 'chat-a',
      type: 'user',
      senderId: 'user',
      senderName: '用户',
      content: '帮我生成番茄炒蛋',
      emotion: 0,
      timestamp: 1,
      isDeleted: false,
    };

    const patchSet = await writeAssistantAgentPatchSet({
      api: { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      chatId: 'chat-a',
      messages: [],
      userMessage,
      plan,
      existingArtifacts: [],
    });

    expect(patchSet.mediaTasks?.[0]?.prompt).toContain('premium food photography');
    expect(patchSet.mediaTasks?.[0]?.prompt).toContain('番茄炒蛋');
    expect(patchSet.mediaTasks?.[0]?.prompt).not.toBe('番茄炒蛋');
  });

  it('rejects update patches outside the planned artifact scope', () => {
    const plan: AssistantAgentChangePlan = {
      intent: 'update',
      scope: { targetMode: 'single', artifactIds: ['artifact-a'] },
      operations: [{ kind: 'style_change', instruction: '字体小一些' }],
      requiresConfirmation: false,
      confidence: 0.92,
    };
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '已调整。',
      patches: [{
        action: 'update',
        artifactId: 'artifact-b',
        kind: 'diagram',
        title: '注册流程',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B',
        baseVersionId: 'version-b',
      }],
    };

    expect(validateAssistantAgentPatchSet({
      patchSet,
      plan,
      existingArtifacts: [artifact()],
    }).patches).toEqual([]);
  });

  it('rejects stale update patches when base version does not match', () => {
    const plan: AssistantAgentChangePlan = {
      intent: 'update',
      scope: { targetMode: 'single', artifactIds: ['artifact-a'] },
      operations: [{ kind: 'content_edit', instruction: '增加审批节点' }],
      requiresConfirmation: false,
      confidence: 0.92,
    };
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '已调整。',
      patches: [{
        action: 'update',
        artifactId: 'artifact-a',
        kind: 'diagram',
        title: '注册流程',
        language: 'mermaid',
        content: 'flowchart TD\nA-->B-->C',
        baseVersionId: 'old-version',
      }],
    };

    expect(validateAssistantAgentPatchSet({
      patchSet,
      plan,
      existingArtifacts: [artifact()],
    }).patches).toEqual([]);
  });

  it('keeps validated image media tasks for create plans', () => {
    const plan: AssistantAgentChangePlan = {
      intent: 'create',
      scope: { targetMode: 'unknown', artifactIds: [] },
      operations: [{ kind: 'create', instruction: '生成一张产品海报' }],
      requiresConfirmation: false,
      confidence: 0.95,
    };
    const patchSet: AssistantAgentPatchSet = {
      assistantMessage: '图片已加入生成队列。',
      patches: [],
      mediaTasks: [{
        kind: 'image',
        prompt: 'A clean product poster, studio lighting',
        altText: '产品海报',
        referenceImages: [{ url: 'https://example.test/ref.png', mimeType: 'image/png', label: '参考图' }],
      }],
    };

    expect(validateAssistantAgentPatchSet({
      patchSet,
      plan,
      existingArtifacts: [],
    }).mediaTasks).toEqual(patchSet.mediaTasks);
  });

  it('deduplicates generated media task slot ids', async () => {
    generateResponseMock.mockResolvedValue(JSON.stringify({
      assistantMessage: '这里是两张图。\n\n![第一张](attachment:image-1)\n\n![第二张](attachment:image-1)',
      patches: [],
      mediaTasks: [
        { kind: 'image', slotId: 'image-1', prompt: 'First image prompt', altText: '第一张' },
        { kind: 'image', slotId: 'image-1', prompt: 'Second image prompt', altText: '第二张' },
      ],
    }));
    const plan: AssistantAgentChangePlan = {
      intent: 'create',
      scope: { targetMode: 'unknown', artifactIds: [] },
      operations: [{ kind: 'create', instruction: '生成两张图' }],
      requiresConfirmation: false,
      confidence: 0.9,
    };
    const userMessage: Message = {
      id: 'message-user',
      chatId: 'chat-a',
      type: 'user',
      senderId: 'user',
      senderName: '用户',
      content: '生成两张图',
      emotion: 0,
      timestamp: 1,
      isDeleted: false,
    };

    const patchSet = await writeAssistantAgentPatchSet({
      api: { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      chatId: 'chat-a',
      messages: [],
      userMessage,
      plan,
      existingArtifacts: [],
    });

    expect(patchSet.mediaTasks?.map((task) => task.slotId)).toEqual(['image-1', 'image-1-2']);
    expect(patchSet.assistantMessage).toContain('attachment:image-1-2');
  });

  it('keeps long user-facing image articles instead of truncating near the first paragraph', async () => {
    const longIntro = `这是一篇图文说明。\n\n${'正文段落。'.repeat(500)}`;
    generateResponseMock.mockResolvedValue(JSON.stringify({
      assistantMessage: longIntro,
      patches: [],
      mediaTasks: [
        { kind: 'image', slotId: 'cover', prompt: 'Cover image prompt', altText: '封面图' },
      ],
    }));
    const plan: AssistantAgentChangePlan = {
      intent: 'create',
      scope: { targetMode: 'unknown', artifactIds: [] },
      operations: [{ kind: 'create', instruction: '生成图文文章' }],
      requiresConfirmation: false,
      confidence: 0.9,
    };
    const userMessage: Message = {
      id: 'message-user',
      chatId: 'chat-a',
      type: 'user',
      senderId: 'user',
      senderName: '用户',
      content: '生成图文文章',
      emotion: 0,
      timestamp: 1,
      isDeleted: false,
    };

    const patchSet = await writeAssistantAgentPatchSet({
      api: { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      chatId: 'chat-a',
      messages: [],
      userMessage,
      plan,
      existingArtifacts: [],
    });

    expect(patchSet.assistantMessage.length).toBeGreaterThan(1000);
    expect(patchSet.assistantMessage).toContain('attachment:cover');
  });

  it('compacts oversized target artifact context for writer requests', async () => {
    generateResponseMock.mockResolvedValue(JSON.stringify({
      assistantMessage: '已修改。',
      patches: [{
        action: 'update',
        artifactId: 'artifact-a',
        kind: 'document',
        title: '长文档',
        content: '模型试图基于裁剪内容生成的新版本',
        baseVersionId: 'version-a',
      }],
      mediaTasks: [],
    }));
    const plan: AssistantAgentChangePlan = {
      intent: 'update',
      scope: { targetMode: 'single', artifactIds: ['artifact-a'] },
      operations: [{ kind: 'content_edit', instruction: '调整措辞' }],
      requiresConfirmation: false,
      confidence: 0.9,
    };
    const userMessage: Message = {
      id: 'message-user',
      chatId: 'chat-a',
      type: 'user',
      senderId: 'user',
      senderName: '用户',
      content: '调整一下这个文档',
      emotion: 0,
      timestamp: 1,
      isDeleted: false,
    };

    const patchSet = await writeAssistantAgentPatchSet({
      api: { provider: 'openai', apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      chatId: 'chat-a',
      messages: [],
      userMessage,
      plan,
      existingArtifacts: [artifact({
        kind: 'document',
        title: '长文档',
        versions: [{
          id: 'version-a',
          artifactId: 'artifact-a',
          content: '正文'.repeat(100_000),
          language: 'markdown',
          sourceMessageId: 'message-a',
          createdAt: 1,
        }],
      })],
    });

    const content = String((generateResponseMock.mock.calls[0]?.[2] as Array<{ content: string }>)[0].content);
    expect(content.length).toBeLessThan(420_000);
    expect(content).toContain('"currentVersionContentTruncated":true');
    expect(content).toContain('上下文已裁剪');
    expect(patchSet.patches).toEqual([]);
    expect(patchSet.assistantMessage).toContain('上下文不足');
  });
});
