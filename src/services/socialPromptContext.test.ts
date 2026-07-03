import { describe, expect, it } from 'vitest';
import type { AICharacter } from '../types/character';
import { buildMessageStyleRules } from './socialPromptContext';

function character(patch: Partial<AICharacter> = {}): AICharacter {
  return {
    id: 'char-1',
    name: '律师',
    avatar: '',
    personality: { openness: 50, extroversion: 45, agreeableness: 45, neuroticism: 40, humor: 30, creativity: 40, assertiveness: 70, empathy: 45 },
    behavior: { proactivity: 45, aggressiveness: 35, humorIntensity: 20, empathyLevel: 45, summarizing: 82, offTopic: 10 },
    expertise: ['合同法', '劳动法'],
    speakingStyle: '',
    background: '',
    relationships: [],
    memory: { longTerm: [], shortTermSummary: '', secrets: [], obsessions: [], tabooTopics: [], userMemories: [] },
    intervention: { allowSpeakAs: true, allowDirectorPrompt: true, allowPrivateThread: true },
    isPreset: false,
    speechProfile: { catchphrases: [], fillers: [], tabooPhrases: [], preferredOpeners: [], preferredClosers: [], sentenceLengthBias: 'short', questionBias: 35, sarcasmBias: 10 },
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe('buildMessageStyleRules', () => {
  it('keeps length situational instead of globally forcing one sentence', () => {
    const prompt = buildMessageStyleRules(character());

    expect(prompt).toContain('Let the situation decide length');
    expect(prompt).toContain('serious professional question may need full reasoning');
    expect(prompt).toContain('must not override a user request');
    expect(prompt).not.toContain('Usually write one sentence');
  });
});
