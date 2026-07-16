import { describe, expect, it } from 'vitest';
import { formatAiAmount } from './aiPoints';

describe('formatAiAmount', () => {
  it('keeps zero as zero', () => {
    expect(formatAiAmount(0, 'moacode')).toBe('0P');
  });

  it('shows tiny non-zero point charges instead of rounding them to zero', () => {
    expect(formatAiAmount(0.0042, 'moacode')).toBe('0.0042P');
    expect(formatAiAmount(0.000034, 'deepseek')).toBe('0.000034P');
  });

  it('keeps compact formatting rounded for small dashboard summaries', () => {
    expect(formatAiAmount(0.0042, 'moacode', { compact: true })).toBe('0P');
  });
});
