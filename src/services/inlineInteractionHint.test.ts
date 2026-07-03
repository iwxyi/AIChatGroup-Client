import { describe, expect, it } from 'vitest';
import type { AICharacter } from '../types/character';
import type { GroupChat } from '../types/chat';
import { buildInlineInteractionContract, parseInlineInteractionEnvelope } from './inlineInteractionHint';

describe('parseInlineInteractionEnvelope story events', () => {
  it('accepts story-reader output with empty content when storyEvents have visible narration', () => {
    const parsed = parseInlineInteractionEnvelope(JSON.stringify({
      content: '',
      storyEvents: [
        { type: 'narration', text: '雨水顺着医院旧楼的铁门往下流。' },
        { type: 'speech', characterId: 'lin', speakerName: '林医生', text: '不要开那扇门。' },
      ],
      storyChoices: null,
      extraMessages: null,
      intentionalRepeat: false,
      conflictFocus: null,
      interactionHints: null,
      socialEventHints: null,
    }));

    expect(parsed?.content).toBe('');
    expect(parsed?.storyEvents).toEqual([
      { type: 'narration', text: '雨水顺着医院旧楼的铁门往下流。' },
      { type: 'speech', characterId: 'lin', speakerName: '林医生', text: '不要开那扇门。' },
    ]);
  });

  it('drops abstract or malformed storyEvents instead of treating them as visible output', () => {
    const parsed = parseInlineInteractionEnvelope(JSON.stringify({
      content: '',
      storyEvents: [
        { type: 'narration', text: '   ' },
        { type: 'choice_point', choices: [{ label: '追查线索' }] },
      ],
      extraMessages: null,
    }));

    expect(parsed).toBeNull();
  });
});

describe('buildInlineInteractionContract analysis room detection', () => {
  it('requires deliberation artifacts when scenario resolves to analysis even if family is stale', () => {
    const contract = buildInlineInteractionContract({
      chat: {
        id: 'chat-1',
        type: 'group',
        mode: 'group_discussion',
        sessionKind: { topology: 'group', family: 'conversation', scenarioId: 'opinion-review', surfaceProfile: 'text' },
        memberIds: ['speaker'],
        runtimeEventsV2: [],
      } as unknown as GroupChat,
      speaker: { id: 'speaker', name: '审议者' } as AICharacter,
      characters: [{ id: 'speaker', name: '审议者' } as AICharacter],
      recentMessages: [],
    });

    expect(contract).toContain('"deliberationArtifacts": {"claims"');
    expect(contract).not.toContain('"deliberationArtifacts": null');
    expect(contract).toContain('Rules for deliberationArtifacts');
    expect(contract).toContain('visible content must either make a deliberative move');
  });
});
