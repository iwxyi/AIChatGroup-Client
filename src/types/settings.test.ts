import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_AI_PROFILE, normalizeAIProfiles } from './settings';

describe('normalizeAIProfiles', () => {
  it('provides official text and image profiles by default', () => {
    const profiles = normalizeAIProfiles();

    expect(profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'text',
        provider: 'official-deepseek',
        model: 'deepseek-chat',
        isDefault: true,
      }),
      expect.objectContaining({
        type: 'image',
        provider: 'official-nanobanana',
        model: DEFAULT_IMAGE_AI_PROFILE.model,
        isDefault: true,
      }),
    ]));
  });

  it('backfills the official image profile when cloud settings only contain text profiles', () => {
    const profiles = normalizeAIProfiles([{
      id: 'default',
      name: 'Text',
      type: 'text',
      isDefault: true,
      provider: 'official-deepseek',
      apiKey: '',
      baseUrl: '/api/ai',
      model: 'deepseek-chat',
    }]);

    expect(profiles.find((profile) => profile.type === 'image')).toEqual(expect.objectContaining({
      provider: 'official-nanobanana',
      model: DEFAULT_IMAGE_AI_PROFILE.model,
      isDefault: true,
    }));
  });
});
