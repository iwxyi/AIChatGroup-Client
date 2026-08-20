import { describe, expect, it } from 'vitest';
import type { Message } from '../../types/message';
import { buildImageAttachmentHoverInfo } from '../../services/messageAttachmentHoverInfo';
import { buildAttachmentQueueProgress, getAttachmentDisplayWidth, parseInlineAttachmentPlaceholders, shouldHideGeneratedMediaPlaceholderText } from './ChatMessageContent';

describe('ChatMessageContent media layout', () => {
  it('uses a fixed intrinsic media width so fit-content bubbles can shrink', () => {
    expect(getAttachmentDisplayWidth({
      displaySize: { width: 420, height: 420 },
      ratioValue: 1,
      maxWidth: 520,
      maxHeight: 520,
    })).toBe(420);
  });

  it('caps large generated images without relying on percentage width', () => {
    expect(getAttachmentDisplayWidth({
      displaySize: { width: 1600, height: 900 },
      ratioValue: 16 / 9,
      maxWidth: 520,
      maxHeight: 520,
    })).toBe(520);
  });

  it('hides generated image queue placeholder text when media attachments exist', () => {
    expect(shouldHideGeneratedMediaPlaceholderText({
      content: '正在生成图片，完成后会自动显示。',
      metadata: {
        attachments: [{
          id: 'att-1',
          kind: 'image',
          status: 'ready',
          altText: '红烧肉照片',
          url: 'data:image/png;base64,AAA',
          createdAt: 1,
          updatedAt: 1,
        }],
      },
    })).toBe(true);
  });

  it('keeps final generated image captions visible', () => {
    expect(shouldHideGeneratedMediaPlaceholderText({
      content: '图片已生成。',
      metadata: {
        attachments: [{
          id: 'att-1',
          kind: 'image',
          status: 'ready',
          altText: '红烧肉照片',
          url: 'data:image/png;base64,AAA',
          createdAt: 1,
          updatedAt: 1,
        }],
      },
    })).toBe(false);
  });

  it('keeps the same text when there is no media attachment', () => {
    expect(shouldHideGeneratedMediaPlaceholderText({
      content: '正在生成图片，完成后会自动显示。',
      metadata: undefined,
    })).toBe(false);
  });

  it('builds hover info from uploaded image summaries and generated prompts', () => {
    expect(buildImageAttachmentHoverInfo({
      id: 'att-1',
      kind: 'image',
      status: 'ready',
      altText: '用户上传图片',
      semanticSummary: '截图里有一段控制台报错。',
      promptText: '不应出现在上传图测试里',
      createdAt: 1,
      updatedAt: 1,
    })).toContain('图片摘要：截图里有一段控制台报错。');

    expect(buildImageAttachmentHoverInfo({
      id: 'att-2',
      kind: 'image',
      status: 'ready',
      altText: '红烧肉照片',
      promptText: '真实红烧肉摄影，酱汁红亮。',
      createdAt: 1,
      updatedAt: 1,
    })).toContain('生成提示词：真实红烧肉摄影，酱汁红亮。');
  });

  it('parses inline markdown attachment placeholders in article content', () => {
    expect(parseInlineAttachmentPlaceholders('开头\n\n![红烧肉成品图](attachment:image-1)\n\n结尾')).toEqual([
      { kind: 'text', text: '开头\n\n' },
      { kind: 'attachment', slotId: 'image-1', altText: '红烧肉成品图' },
      { kind: 'text', text: '\n\n结尾' },
    ]);
  });

  it('sanitizes malformed inline attachment slot ids without throwing', () => {
    expect(parseInlineAttachmentPlaceholders('![图](attachment:%E0%A4%A../bad id)')).toEqual([
      { kind: 'attachment', slotId: 'E0A4A..badid', altText: '图' },
    ]);
  });

  it('uses the real global media queue snapshot for progress text', () => {
    const message: Message = {
      id: 'message-1',
      chatId: 'chat-1',
      type: 'ai',
      senderId: 'assistant',
      senderName: '助手',
      content: '',
      emotion: 0,
      timestamp: 1,
      isDeleted: false,
      metadata: {
        attachments: [{
          id: 'image-1',
          kind: 'image' as const,
          status: 'queued' as const,
          altText: '番茄炒蛋',
          createdAt: 1,
          updatedAt: 1,
        }],
      },
    };
    const attachment = message.metadata?.attachments?.[0];
    expect(attachment).toBeDefined();

    expect(buildAttachmentQueueProgress(message, attachment!)).toBe('');
    expect(buildAttachmentQueueProgress(message, attachment!, [{
      messageId: 'message-1',
      attachmentId: 'image-1',
      kind: 'image',
      status: 'queued',
      position: 1,
      total: 3,
    }])).toBe('对方正在发送图片（队列 1/3）');
  });
});
