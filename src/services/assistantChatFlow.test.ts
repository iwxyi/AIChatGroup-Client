import { describe, expect, it } from 'vitest';
import type { AssistantAgentPatchSet } from '../types/assistantArtifact';
import type { Message } from '../types/message';
import { buildAgentArtifactReplyContent, markAssistantMediaAttachmentsFailed } from './assistantChatFlow';

describe('assistantChatFlow media artifacts', () => {
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
