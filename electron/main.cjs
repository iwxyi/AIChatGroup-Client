const { app, BrowserWindow, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_PROTOCOL = 'app';
const APP_HOST = 'sense-murmur';
const DEV_SERVER_ARG = '--dev-server=';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

function resolveDistPath(requestUrl) {
  const distRoot = path.resolve(__dirname, '..', 'dist');
  const url = new URL(requestUrl);
  const requestedPath = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'index.html';
  const target = path.resolve(distRoot, requestedPath);
  if (!target.startsWith(distRoot)) return path.join(distRoot, 'index.html');
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  return path.join(distRoot, 'index.html');
}

async function registerAppProtocol() {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolveDistPath(request.url);
    const body = await fs.promises.readFile(filePath);
    return new Response(body, {
      headers: { 'content-type': contentTypeFor(filePath) },
    });
  });
}

function getDevServerUrl() {
  const arg = process.argv.find((value) => value.startsWith(DEV_SERVER_ARG));
  return arg ? arg.slice(DEV_SERVER_ARG.length) : '';
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: '生息 Sense Murmur',
    backgroundColor: '#f8f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const devServerUrl = getDevServerUrl();
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await win.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
}

app.whenReady().then(async () => {
  await registerAppProtocol();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
