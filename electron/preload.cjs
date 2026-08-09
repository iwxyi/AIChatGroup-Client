const { clipboard, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('senseMurmurDesktop', {
  platform: process.platform,
  writeClipboardText(text) {
    const value = String(text || '');
    if (!value) return false;
    clipboard.writeText(value);
    return clipboard.readText() === value;
  },
});
