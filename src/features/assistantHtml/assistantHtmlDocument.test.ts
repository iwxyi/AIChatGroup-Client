import { describe, expect, it } from 'vitest';
import { buildAssistantHtmlDocument } from './assistantHtmlDocument';
import { modifyAssistantCssColor, transformAssistantCssColors } from './assistantHtmlDarkTheme';

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
  it('uses static professional conversion for legacy HTML in dark mode', () => {
    const document = build('dark');
    expect(document).toContain('.card{background:#111318;color:#dce0e3}');
    expect(document).toContain('displayMode":"dark"');
    expect(document).toContain('applyDisplayMode()');
    expect(document).not.toContain('html{color-scheme:dark}');
    expect(document).not.toContain('setViewerColor');
    expect(document).not.toContain('getComputedStyle');
  });

  it('keeps the original HTML available in light mode', () => {
    const document = build('light');
    expect(document).toContain('.card{background:#fff;color:#111}');
    expect(document).toContain('<div class="card">原始内容</div>');
    expect(document).toContain('displayMode":"light"');
  });

  it('uses role-aware Dark Reader-derived static conversion for legacy colors', () => {
    expect(modifyAssistantCssColor('#111827', 'foreground')).toBe('#d4d9dd');
    expect(modifyAssistantCssColor('#ffffff', 'background')).toBe('#111318');
    expect(modifyAssistantCssColor('rgba(250, 255, 189, 0.5)', 'background')).toMatch(/^#[0-9a-f]{8}$/i);
    expect(transformAssistantCssColors('.card{background:#fff;color:#111827;border:1px solid #e5e7eb}')).toContain('background:#111318');
  });

  it('prefers an artifact native theme contract over compatibility conversion', () => {
    const document = buildAssistantHtmlDocument({
      html: '<style>:root,html[data-pneumata-theme="light"]{--pneumata-bg:#fff}html[data-pneumata-theme="dark"]{--pneumata-bg:#111}@media (prefers-color-scheme:dark){:root{--pneumata-bg:#111}}body{background:var(--pneumata-bg)}</style><div>主题内容</div>',
      manifest,
      channelToken: 'native-theme',
      artifactId: 'artifact-theme',
      versionId: 'version-theme',
      displayMode: 'dark',
    });
    expect(document).toContain('hasNativeThemeContract":true');
    expect(document).toContain("setAttribute('data-pneumata-theme',config.displayMode)");
    expect(document).toContain('html{color-scheme:dark}');
    expect(document).toContain('if(!config.hasNativeThemeContract)return');
  });

  it('uses professional conversion fallback for an incomplete native theme contract', () => {
    const document = buildAssistantHtmlDocument({
      html: '<style>:root{--pneumata-bg:#fff}html[data-pneumata-theme="dark"]{--pneumata-bg:#111}</style><div>不完整主题</div>',
      manifest,
      channelToken: 'incomplete-theme',
      artifactId: 'artifact-incomplete',
      versionId: 'version-incomplete',
      displayMode: 'dark',
    });
    expect(document).toContain('hasNativeThemeContract":false');
    expect(document).not.toContain('html{color-scheme:dark}');
  });

});
