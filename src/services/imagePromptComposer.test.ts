import { describe, expect, it } from 'vitest';
import { enhanceImagePrompt } from './imagePromptComposer';

describe('imagePromptComposer', () => {
  it('expands terse food prompts into a more polished food photography prompt', () => {
    const prompt = enhanceImagePrompt('番茄炒蛋');

    expect(prompt).toContain('premium food photography');
    expect(prompt).toContain('soft natural side light');
    expect(prompt).toContain('番茄炒蛋');
    expect(prompt).not.toBe('番茄炒蛋');
  });

  it('keeps already detailed prompts intact', () => {
    const prompt = 'A cinematic portrait, soft rim light, shallow depth of field, editorial photography';

    expect(enhanceImagePrompt(prompt)).toBe(prompt);
  });
});
