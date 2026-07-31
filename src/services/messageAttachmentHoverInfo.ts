import type { MessageAttachment } from '../types/message';

export function buildImageAttachmentHoverInfo(attachment: MessageAttachment, caption?: string) {
  const sections = [
    attachment.semanticSummary ? `图片摘要：${attachment.semanticSummary}` : '',
    attachment.promptText ? `生成提示词：${attachment.promptText}` : '',
    caption || attachment.caption ? `说明：${caption || attachment.caption}` : '',
    attachment.altText ? `名称：${attachment.altText}` : '',
  ].filter(Boolean);
  return Array.from(new Set(sections)).join('\n\n');
}
