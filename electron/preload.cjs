const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('senseMurmurDesktop', {
  platform: process.platform,
});
