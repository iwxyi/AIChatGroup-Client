import { describe, expect, it } from 'vitest';
import { buildAssistantHtmlDocument } from './assistantHtmlDocument';

const manifest = { schemaVersion: 1, presentation: 'fullscreen', executionMode: 'declarative' } as const;

function build(displayMode: 'light' | 'dark') {
  return buildAssistantHtmlDocument({
    html: '<style>.card{background:#fff;color:#111}</style><div class="card">原始内容</div>',
    manifest,
    channelToken: 'test-channel',
    artifactId: 'artifact-1',
    versionId: 'version-1',
    displayMode,
  });
}

describe('assistant HTML viewer display mode', () => {
  it('injects dark viewer mapping without rewriting source styles', () => {
    const document = build('dark');
    expect(document).toContain('.card{background:#fff;color:#111}');
    expect(document).toContain('displayMode":"dark"');
    expect(document).toContain('applyDisplayMode()');
    expect(document).toContain('darkBackground');
    expect(document).toContain('darkForeground');
    expect(document).toContain('darkBorder');
    expect(document).toContain('coloredForeground');
    expect(document).toContain('coloredBackground');
    expect(document).toContain('originalLightness');
    expect(document).toContain("alpha<1?'rgb('");
    expect(document).toContain('coloredBorder');
    expect(document).toContain('<=10');
    expect(document).toContain('html{color-scheme:dark}');
    expect(document).toContain("source.match(/[0-9.]+/g)");
    expect(document).not.toContain("rgba?(s*");
  });

  it('keeps the original HTML available in light mode', () => {
    const document = build('light');
    expect(document).toContain('<div class="card">原始内容</div>');
    expect(document).toContain('displayMode":"light"');
  });

});
