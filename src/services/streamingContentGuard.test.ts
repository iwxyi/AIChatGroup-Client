import { describe, expect, it } from 'vitest';
import { hasRenderableStreamingContent } from './streamingContentGuard';

describe('hasRenderableStreamingContent', () => {
  it('rejects whitespace-only model output', () => {
    expect(hasRenderableStreamingContent('')).toBe(false);
    expect(hasRenderableStreamingContent('        ')).toBe(false);
    expect(hasRenderableStreamingContent('\n\t   \n')).toBe(false);
  });

  it('accepts visible text', () => {
    expect(hasRenderableStreamingContent('  你好  ')).toBe(true);
  });
});
