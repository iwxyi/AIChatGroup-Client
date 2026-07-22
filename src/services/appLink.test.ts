import { describe, expect, it } from 'vitest';
import { normalizeInternalAppHref, parseAppLink, resolveAppLinkToWebPath, serializeAppLink } from './appLink';

describe('appLink', () => {
  it('serializes and parses ssmm character links with params', () => {
    const href = serializeAppLink({
      target: 'character',
      id: 'local-character-1',
      action: 'edit',
      params: { tab: 'profile' },
    });

    expect(href).toBe('ssmm://character/local-character-1?action=edit&tab=profile');
    expect(parseAppLink(href)).toMatchObject({
      scheme: 'ssmm',
      version: 1,
      target: 'character',
      id: 'local-character-1',
      action: 'edit',
      params: { tab: 'profile' },
    });
  });

  it('converts ssmm links to web routes', () => {
    const link = parseAppLink('ssmm://settings?action=open&tab=models&card=models');
    expect(link && resolveAppLinkToWebPath(link)).toBe('/settings?tab=models&card=models');
  });

  it('keeps legacy web character links compatible', () => {
    const link = parseAppLink('/characters/local-character-1/edit?tab=relationship');
    expect(link).toMatchObject({
      target: 'character',
      id: 'local-character-1',
      action: 'edit',
      params: { tab: 'relationship' },
    });
    expect(link && resolveAppLinkToWebPath(link)).toBe('/characters/local-character-1/edit?tab=relationship');
  });

  it('keeps legacy chat links compatible', () => {
    const link = parseAppLink('/chats/local-chat-1?fromTab=3');
    expect(link).toMatchObject({
      target: 'chat',
      id: 'local-chat-1',
      action: 'open',
      params: { fromTab: '3' },
    });
    expect(link && resolveAppLinkToWebPath(link)).toBe('/chats/local-chat-1?fromTab=3');
  });

  it('canonicalizes legacy internal links to ssmm links for persisted content', () => {
    expect(normalizeInternalAppHref('/characters/local-character-1/edit?tab=profile')).toBe('ssmm://character/local-character-1?action=edit&tab=profile');
    expect(normalizeInternalAppHref('/chats/local-chat-1?fromTab=3')).toBe('ssmm://chat/local-chat-1?action=open&fromTab=3');
    expect(normalizeInternalAppHref('https://example.com')).toBe('https://example.com');
  });
});
