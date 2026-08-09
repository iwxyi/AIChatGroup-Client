type DesktopClipboardBridge = {
  writeClipboardText?: (text: string) => boolean | Promise<boolean>;
};

function getDesktopClipboardBridge(): DesktopClipboardBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as Window & { senseMurmurDesktop?: DesktopClipboardBridge }).senseMurmurDesktop;
  return bridge?.writeClipboardText ? bridge : null;
}

export async function copyTextToClipboard(text: string) {
  const value = String(text || '');
  if (!value) return false;

  const desktopBridge = getDesktopClipboardBridge();
  if (desktopBridge?.writeClipboardText) {
    try {
      const copied = await desktopBridge.writeClipboardText(value);
      if (copied) return true;
    } catch {
      // Continue to browser clipboard fallbacks below.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Continue to the legacy fallback below.
    }
  }

  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}
