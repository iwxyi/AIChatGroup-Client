import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('uses the Clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    vi.stubGlobal('window', { isSecureContext: true });
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('uses the desktop clipboard bridge before browser fallbacks', async () => {
    const writeClipboardText = vi.fn().mockReturnValue(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const testWindow = {};
    vi.stubGlobal('window', testWindow);
    Object.defineProperty(testWindow, 'senseMurmurDesktop', {
      configurable: true,
      value: { writeClipboardText },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await expect(copyTextToClipboard('desktop')).resolves.toBe(true);
    expect(writeClipboardText).toHaveBeenCalledWith('desktop');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not report a legacy copy as successful in an insecure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(copyTextToClipboard('insecure')).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns false for empty text', async () => {
    await expect(copyTextToClipboard('')).resolves.toBe(false);
  });
});
