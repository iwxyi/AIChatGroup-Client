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

  // Do not treat document.execCommand('copy') as a success signal. Recent
  // Chromium can report true without updating the system clipboard when the
  // page is served over HTTP or blocked by a Permissions-Policy.
  if (typeof window !== 'undefined' && window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
