import type { Message, NarrativeBlock } from '../../types/message';
import { buildStoryNodeProgress } from '../../services/storyNodeProgress';
import { buildChatRenderItems, type ChatRenderItem } from './chatRenderModel';
import { shouldRenderEventMessage, type EventRenderFlags } from './eventMessagePresentation';
import type { NarrativeStoryChoiceOption } from './messageBubblePresentation';
import { getVisibleNarrativeDisplayBlocks } from './messageListPresentation';

export type MessageListRenderKind =
  | ChatRenderItem['renderKind']
  | 'narrative-block'
  | 'narrative-progress'
  | 'story-choice';

export interface MessageListRenderItem {
  key: string;
  message: Message;
  sourceItem: ChatRenderItem;
  pending: boolean;
  renderKind: MessageListRenderKind;
  block?: NarrativeBlock;
  blockIndex?: number;
  completeNarrativeReveal?: boolean;
}

export function buildMessageListRenderItems(params: {
  messages: Message[];
  eventRenderFlags: EventRenderFlags;
  showDeveloperDetails: boolean;
  storyChoiceMessageId?: string | null;
  storyChoiceOptions?: NarrativeStoryChoiceOption[];
}): MessageListRenderItem[] {
  const baseItems = buildChatRenderItems(params.messages)
    .filter((item) => item.renderKind !== 'event' || shouldRenderEventMessage(item.message, params.eventRenderFlags));
  const flattened: MessageListRenderItem[] = [];

  for (const item of baseItems) {
    if (item.renderKind !== 'narrative') {
      flattened.push({
        key: item.key,
        message: item.message,
        sourceItem: item,
        pending: item.pending,
        renderKind: item.renderKind,
      });
      continue;
    }

    const showStoryChoices = item.message.id === params.storyChoiceMessageId
      && (params.storyChoiceOptions?.length ?? 0) > 0;
    const blocks = getVisibleNarrativeDisplayBlocks(item.message, params.showDeveloperDetails);
    if (!blocks.length) {
      if (showStoryChoices) {
        flattened.push({
          key: `${item.key}:story-choice`,
          message: item.message,
          sourceItem: item,
          pending: item.pending,
          renderKind: 'story-choice',
        });
      }
      continue;
    }

    blocks.forEach((block, index) => {
      const blockKey = `${item.key}:block:${block.id || index}`;
      flattened.push({
        key: blockKey,
        message: item.message,
        sourceItem: item,
        pending: item.pending,
        renderKind: 'narrative-block',
        block,
        blockIndex: index,
        completeNarrativeReveal: index === 0,
      });
    });
    if (buildStoryNodeProgress(item.message)) {
      flattened.push({
        key: `${item.key}:story-progress`,
        message: item.message,
        sourceItem: item,
        pending: item.pending,
        renderKind: 'narrative-progress',
      });
    }
    if (showStoryChoices) {
      flattened.push({
        key: `${item.key}:story-choice`,
        message: item.message,
        sourceItem: item,
        pending: item.pending,
        renderKind: 'story-choice',
      });
    }
  }

  return flattened;
}
