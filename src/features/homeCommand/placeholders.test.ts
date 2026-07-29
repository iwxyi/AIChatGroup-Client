import { describe, expect, it } from 'vitest';
import { getRandomHomeCommandPlaceholderIndex, HOME_COMMAND_PLACEHOLDERS, resolveHomeCommandSubmissionValue } from './placeholders';

describe('home command placeholders', () => {
  it('uses the active placeholder when input is empty', () => {
    expect(resolveHomeCommandSubmissionValue('   ', '生成一份纪要')).toBe('生成一份纪要');
    expect(resolveHomeCommandSubmissionValue(' 打开聊天 ', '生成一份纪要')).toBe('打开聊天');
  });

  it('randomizes initial placeholder from the full list', () => {
    expect(getRandomHomeCommandPlaceholderIndex(-1, () => 0)).toBe(0);
    expect(getRandomHomeCommandPlaceholderIndex(-1, () => 0.999)).toBe(HOME_COMMAND_PLACEHOLDERS.length - 1);
  });

  it('rotates to a different placeholder after initialization', () => {
    const next = getRandomHomeCommandPlaceholderIndex(0, () => 0);

    expect(next).toBe(1);
    expect(next).not.toBe(0);
  });
});
