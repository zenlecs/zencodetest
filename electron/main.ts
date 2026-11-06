import { protocol } from 'electron';
import { app, BrowserWindow, ipcMain, powerSaveBlocker, screen, session, type WebContents } from 'electron';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'zenos-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false
    }
  }
]);


import * as path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'electron-updater';
import * as fs from 'fs';
import { installedIndexPath, payloadInstall, payloadStatus } from './payload';

const logCrash = (type: string, message: string) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] ${type}: ${message}\n`, { flag: 'a' });
  } catch {
    // ignore
  }
};

process.on('uncaughtException', (err) => {
  logCrash('Uncaught Exception', err.stack || err.message);
});
process.on('unhandledRejection', (reason) => {
  logCrash('Unhandled Rejection', String(reason));
});

const { autoUpdater } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let launcherWindow: BrowserWindow | null = null;
let islandWindow: BrowserWindow | null = null;
let voiceBlockerId: number | null = null;
let islandQuitting = false;
let islandDismissed = false;
let islandDismissing = false;
let lastVisibleBounds: { x: number; y: number; width: number; height: number } | null = null;

function isAppWindow(contents: WebContents | null): boolean {
  return !!contents && !!mainWindow && !mainWindow.isDestroyed() && contents.id === mainWindow.webContents.id;
}

function isIslandContents(contents: WebContents | null): boolean {
  return !!contents && !!islandWindow && !islandWindow.isDestroyed() && contents.id === islandWindow.webContents.id;
}

function allowsAssistantMedia(contents: WebContents | null): boolean {
  return isAppWindow(contents) || isIslandContents(contents);
}

function startVoiceBlocker() {
  if (voiceBlockerId !== null && powerSaveBlocker.isStarted(voiceBlockerId)) return;
  voiceBlockerId = powerSaveBlocker.start('prevent-app-suspension');
}

function stopVoiceBlocker() {
  if (voiceBlockerId !== null && powerSaveBlocker.isStarted(voiceBlockerId)) {
    powerSaveBlocker.stop(voiceBlockerId);
  }
  voiceBlockerId = null;
}

/** Shared session cookie jar — both launcher and app windows use the same loopback session */
const sessionCookies: Record<string, string> = {};

function clearSessionCookies() {
  for (const key of Object.keys(sessionCookies)) {
    delete sessionCookies[key];
  }
}

function parseSetCookieHeaders(setCookies: string | string[] | undefined) {
  if (!setCookies) return;
  const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const cookieStr of cookieArray) {
    const [nameValue] = cookieStr.split(';');
    if (!nameValue) continue;
    const eq = nameValue.indexOf('=');
    if (eq <= 0) continue;
    const key = nameValue.slice(0, eq).trim();
    const value = nameValue.slice(eq + 1).trim();
    if (cookieStr.toLowerCase().includes('max-age=0') || value === '') {
      delete sessionCookies[key];
    } else {
      sessionCookies[key] = value;
    }
  }
}

function virtualScreenBounds() {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return { x: 0, y: 0, width: 1280, height: 800 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const display of displays) {
    const bounds = display.bounds;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function mainIsOnScreen(win: BrowserWindow | null): boolean {
  if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return false;
  const bounds = win.getBounds();
  return bounds.width > 40 && bounds.height > 40 && bounds.x > -16000 && bounds.y > -16000;
}

function islandHostPayload() {
  const origin = islandWindow && !islandWindow.isDestroyed()
    ? islandWindow.getBounds()
    : virtualScreenBounds();
  const win = mainWindow;
  const bounds = win && !win.isDestroyed() ? win.getBounds() : null;
  const onScreen = mainIsOnScreen(win);
  if (onScreen && bounds) {
    lastVisibleBounds = bounds;
    return {
      attached: true,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      originX: origin.x,
      originY: origin.y,
    };
  }
  const anchor = lastVisibleBounds ?? screen.getPrimaryDisplay().bounds;
  const area = screen.getDisplayMatching(anchor).workArea;
  return {
    attached: false,
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    originX: origin.x,
    originY: origin.y,
  };
}

function publishIslandHost() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  islandWindow.webContents.send('island-host', islandHostPayload());
}

function fitIslandWindow() {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  islandWindow.setBounds(virtualScreenBounds());
}

function destroyIslandWindow() {
  islandDismissed = false;
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.removeAllListeners();
    islandWindow.destroy();
  }
  islandWindow = null;
}

function createIslandWindow() {
  if (islandWindow && !islandWindow.isDestroyed()) {
    fitIslandWindow();
    islandWindow.setIgnoreMouseEvents(true, { forward: true });
    if (!islandDismissed && !islandWindow.isVisible()) islandWindow.showInactive();
    publishIslandHost();
    return;
  }

  const bounds = virtualScreenBounds();
  islandWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    skipTaskbar: true,
    focusable: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: getPreloadPath(),
      additionalArguments: ['--zenos-window=island'],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  islandWindow.setAlwaysOnTop(true, 'pop-up-menu');
  islandWindow.setIgnoreMouseEvents(true, { forward: true });
  loadRenderer(islandWindow, 'app', '/standalone/island', installedAppIndex);

  islandWindow.on('close', (event) => {
    if (islandQuitting) return;
    event.preventDefault();
  });

  islandWindow.once('ready-to-show', () => {
    if (!islandWindow || islandWindow.isDestroyed()) return;
    fitIslandWindow();
    islandWindow.webContents.setBackgroundThrottling(false);
    if (!islandDismissed) islandWindow.showInactive();
    publishIslandHost();
    publishIslandVoice();
  });

  islandWindow.on('closed', () => {
    islandWindow = null;
  });
}

function dismissFloatingIsland() {
  const win = mainWindow;
  if (!win || win.isDestroyed() || mainIsOnScreen(win)) return;
  islandDismissed = true;
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.setIgnoreMouseEvents(true, { forward: true });
    islandWindow.hide();
  }
  if (!win.isMinimized()) {
    islandDismissing = true;
    win.showInactive();
    win.minimize();
    islandDismissing = false;
  }
}

function revealDismissedIsland(win: BrowserWindow) {
  if (islandDismissing || !islandDismissed || !mainIsOnScreen(win)) return;
  islandDismissed = false;
  createIslandWindow();
}

function bindMainForIsland(win: BrowserWindow) {
  const publish = () => {
    revealDismissedIsland(win);
    publishIslandHost();
  };
  const restore = () => {
    if (islandDismissed) {
      islandDismissed = false;
      createIslandWindow();
    }
    publishIslandHost();
  };
  win.on('move', publish);
  win.on('resize', publish);
  win.on('maximize', publish);
  win.on('unmaximize', publish);
  win.on('minimize', publish);
  win.on('restore', restore);
  win.on('hide', publish);
  win.on('show', publish);
}

function mergeCookieHeader(incoming?: string): string {
  const merged = { ...sessionCookies };
  if (incoming) {
    for (const part of incoming.split(';')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (key) merged[key] = value;
    }
  }
  Object.assign(sessionCookies, merged);
  return Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// Determine preload script path correctly
const getPreloadPath = () => {
  return path.join(__dirname, 'preload.cjs');
};

function getAppIconPath() {
  return isDev
    ? path.join(app.getAppPath(), 'launcher/public/icon.png')
    : path.join(app.getAppPath(), 'dist/launcher/icon.png');
}

function loadRenderer(win: BrowserWindow, product: 'launcher' | 'app', hashRoute: string, installedIndex?: string | null) {
  if (isDev) {
    const port = product === 'launcher' ? 5173 : 5174;
    win.loadURL(`http://127.0.0.1:${port}/#${hashRoute}`);
    return;
  }
  if (product === 'app' && installedIndex) {
    win.loadFile(installedIndex, { hash: hashRoute });
    return;
  }
  win.loadFile(path.join(__dirname, '../dist', product, 'index.html'), { hash: hashRoute });
}

function createLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    return;
  }

  launcherWindow = new BrowserWindow({
    icon: getAppIconPath(),
    width: 1280,
    height: 800,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: getPreloadPath(),
      additionalArguments: ['--zenos-window=launcher'],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
  });

  loadRenderer(launcherWindow, 'launcher', '/');

  launcherWindow.on('closed', () => {
    launcherWindow = null;
    // Closing launcher ends the session — close app window without resurrecting launcher
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeAllListeners('closed');
      mainWindow.on('closed', () => {
        mainWindow = null;
      });
      mainWindow.destroy();
      mainWindow = null;
    }
    clearSessionCookies();
  });

  if (isDev) {
    launcherWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    launcherWindow?.hide();
    mainWindow.webContents.send('auth-session-ready');
    return;
  }

  mainWindow = new BrowserWindow({
    icon: getAppIconPath(),
    width: 1440,
    height: 900,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      additionalArguments: ['--zenos-window=app'],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
  });

  loadRenderer(mainWindow, 'app', '/os', installedAppIndex);
  bindMainForIsland(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.maximize();
    mainWindow.show();
    launcherWindow?.hide();
    mainWindow.webContents.send('auth-session-ready');
  });

  mainWindow.on('close', (event) => {
    if (islandQuitting) return;
    if (!islandWindow || islandWindow.isDestroyed() || !islandWindow.isVisible()) return;
    event.preventDefault();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.hide();
    publishIslandHost();
  });

  mainWindow.on('closed', () => {
    stopVoiceBlocker();
    destroyIslandWindow();
    mainWindow = null;
    // App closed without explicit logout IPC — return to launcher auth surface
    clearSessionCookies();
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.show();
      launcherWindow.focus();
      launcherWindow.webContents.send('auth-logged-out');
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

let installedAppIndex: string | null = null;
let communicationWindow: BrowserWindow | null = null;

function createCommunicationWindow() {
  if (communicationWindow && !communicationWindow.isDestroyed()) {
    communicationWindow.focus();
    return;
  }

  communicationWindow = new BrowserWindow({
    icon: getAppIconPath(),
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 400,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    webPreferences: {
      preload: getPreloadPath(),
      additionalArguments: ["--zenos-window=app"],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  loadRenderer(communicationWindow, "app", "/standalone/communications", installedAppIndex);

  communicationWindow.on("closed", () => {
    communicationWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("communication-window-closed");
    }
  });
}

async function handleAuthLogin() {
  installedAppIndex = await installedIndexPath();
  if (!installedAppIndex && !isDev) {
    launcherWindow?.webContents.send('payload-progress', {
      status: 'error',
      message: 'Finish the installation first.',
      localSha: null,
      remoteSha: null,
      version: null,
      percent: 0,
      bytesPerSecond: 0,
      upToDate: false,
    });
    return;
  }
  createMainWindow();
}

function handleAuthLogout() {
  clearSessionCookies();
  destroyIslandWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    // Prevent closed-handler from double-firing auth-logged-out / clearing again
    mainWindow.removeAllListeners('closed');
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    mainWindow.close();
  }

  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    launcherWindow.webContents.send('auth-logged-out');
  } else {
    createLauncherWindow();
    // Wait for launcher to load before notifying
    launcherWindow?.webContents.once('did-finish-load', () => {
      launcherWindow?.webContents.send('auth-logged-out');
    });
  }
}



// Hardened Webview & Navigation Security Policies
app.on('web-contents-created', (_, contents) => {
  // Strip dangerous properties and enforce sandbox on all webviews (Zenium)
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete (webPreferences as any).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.allowRunningInsecureContent = false;

    // Restrict navigation protocols
    try {
      const parsedUrl = new URL(params.src);
      if (parsedUrl.protocol !== 'https:') {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Block unauthorized child windows / popups
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Guard top-level navigation
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (contents.getType() === 'window' && !isDev && parsed.protocol !== 'file:') {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });
});

app.whenReady().then(() => {
  const appSession = session.defaultSession;
  // Medya isteği yoksa Electron bunu sormadan reddeder. Ses ve mevcut aramalar
  // yalnızca uygulama penceresinde açılır; başlatıcı ve gömülü sayfalar açamaz.
  appSession.setPermissionCheckHandler((contents, permission) => {
    if (permission === 'media') return allowsAssistantMedia(contents);
    return permission === 'fullscreen'
      || permission === 'clipboard-sanitized-write'
      || permission === 'notifications'
      || permission === 'pointerLock';
  });
  appSession.setPermissionRequestHandler((contents, permission, callback) => {
    if (permission === 'media') {
      callback(allowsAssistantMedia(contents));
      return;
    }
    callback(
      permission === 'fullscreen' ||
      permission === 'clipboard-sanitized-write' ||
      permission === 'notifications' ||
      permission === 'pointerLock'
    );
  });

  // Custom secure protocol for internal assets in Electron
  protocol.handle('zenos-asset', async (request) => {
    try {
      const url = new URL(request.url);
      let assetPath = url.pathname;
      // Handle both zenos-asset://app/path and zenos-asset://path
      if ((!assetPath || assetPath === '/') && url.host && url.host !== 'app') {
        assetPath = '/' + url.host;
      }
      const normalizedPath = path.posix.normalize(assetPath);
      if (!normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
        return new Response('Forbidden: path traversal detected', { status: 403 });
      }
      const port = await ensureLocalServer();
      const targetUrl = `http://127.0.0.1:${port}/assets${normalizedPath}`;
      return fetch(targetUrl, {
        headers: {
          'Authorization': `Bearer ${LOOPBACK_SECRET}`,
          'Origin': 'zenos-electron',
        }
      });
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });
  createLauncherWindow();
  const refitIsland = () => {
    fitIslandWindow();
    publishIslandHost();
  };
  screen.on('display-added', refitIsland);
  screen.on('display-removed', refitIsland);
  screen.on('display-metrics-changed', refitIsland);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopVoiceBlocker();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  islandQuitting = true;
  stopVoiceBlocker();
});

// Window controls IPC
ipcMain.on('window-min', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-max', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

// Legacy alias — prefer auth-login
ipcMain.on('launch-main-app', () => {
  handleAuthLogin();
});

ipcMain.on('auth-login', () => {
  handleAuthLogin();
});

ipcMain.on('auth-logout', () => {
  handleAuthLogout();
});

ipcMain.handle('payload-status', () => payloadStatus());

ipcMain.handle('payload-install', (event) => payloadInstall((update) => {
  event.sender.send('payload-progress', update);
}));

ipcMain.on('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.on('detach-communication', () => {
  createCommunicationWindow();
});

ipcMain.on('island-visibility', (event, visible) => {
  const show = visible === true;
  if (show) {
    if (islandDismissed && mainIsOnScreen(mainWindow)) islandDismissed = false;
    if (!islandDismissed) createIslandWindow();
  }
  else if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.setIgnoreMouseEvents(true, { forward: true });
    islandWindow.hide();
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
  for (const win of [mainWindow, islandWindow]) {
    if (!win || win.isDestroyed() || win.webContents === event.sender) continue;
    win.webContents.send('island-visibility', show);
  }
});

ipcMain.on('island-sync', () => {
  publishIslandHost();
});

ipcMain.on('island-dismiss', () => {
  dismissFloatingIsland();
});

ipcMain.on('island-hit', (_event, interactive) => {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  if (interactive) islandWindow.setIgnoreMouseEvents(false);
  else islandWindow.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on('island-focus', (_event, on) => {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  if (on) islandWindow.focus();
  else islandWindow.blur();
});

ipcMain.on('island-voice', (event, payload) => {
  if (!islandWindow || islandWindow.isDestroyed()) return;
  if (event.sender === islandWindow.webContents) return;
  islandWindow.webContents.send('island-voice', payload);
});

ipcMain.on('island-notifications', (event, payload) => {
  for (const win of [mainWindow, islandWindow]) {
    if (!win || win.isDestroyed() || win.webContents === event.sender) continue;
    win.webContents.send('island-notifications', payload);
  }
});

let bloomAwake = false;

function refreshContentThrottling() {
  const throttle = !(bloomAwake || voiceBlockerId !== null);
  for (const win of [mainWindow, communicationWindow, islandWindow]) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.setBackgroundThrottling(win === islandWindow ? false : throttle);
  }
}

let islandVoiceActive = false;

function publishIslandVoice() {
  const payload = { active: islandVoiceActive };
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send('island-voice-control', payload);
  }
  for (const win of [mainWindow, communicationWindow]) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send('island-voice-state', payload);
  }
}

ipcMain.on('island-bloom', (event, payload) => {
  const blue = Number(payload?.blue) || 0;
  const red = Number(payload?.red) || 0;
  const awake = blue > 0.01 || red > 0.01;
  if (awake !== bloomAwake) {
    bloomAwake = awake;
    refreshContentThrottling();
  }
  for (const win of [mainWindow, communicationWindow]) {
    if (!win || win.isDestroyed() || win.webContents === event.sender) continue;
    win.webContents.send('island-bloom', payload);
  }
});

ipcMain.on('island-navigate', (_event, path) => {
  if (typeof path !== 'string' || !path.startsWith('/')) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('island-navigate', path);
});

// Theme sync
ipcMain.on('island-voice-sync', () => {
  publishIslandVoice();
});

ipcMain.on('island-voice-control', (_event, payload) => {
  if (payload && typeof payload.active === 'boolean') islandVoiceActive = payload.active;
  else islandVoiceActive = !islandVoiceActive;
  publishIslandVoice();
});

ipcMain.on('voice-session-start', (event) => {
  if (!allowsAssistantMedia(event.sender)) return;
  startVoiceBlocker();
  refreshContentThrottling();
});

ipcMain.on('voice-session-stop', (event) => {
  if (!allowsAssistantMedia(event.sender)) return;
  stopVoiceBlocker();
  refreshContentThrottling();
});

ipcMain.on('theme-sync', (event, theme) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    // Broadcast to all windows except the sender
    if (win.webContents !== event.sender) {
      win.webContents.send('theme-updated', theme);
    }
  });
});

// Auto Updater Setup
autoUpdater.autoDownload = false;
autoUpdater.setFeedURL({
  provider: 'generic',
  url: process.env.ZENOS_UPDATE_URL || 'https://releases.zenlecs.com'
});

ipcMain.on('check-for-updates', () => {
  if (isDev) {
    // Simulate no update in dev mode
    setTimeout(() => {
      launcherWindow?.webContents.send('updater-status', { status: 'update-not-available' });
    }, 1000);
    return;
  }
  autoUpdater.checkForUpdates();
});

ipcMain.on('download-update', () => {
  if (!isDev) {
    autoUpdater.downloadUpdate();
  }
});

ipcMain.on('install-update', () => {
  if (!isDev) {
    autoUpdater.quitAndInstall();
  }
});

autoUpdater.on('checking-for-update', () => {
  launcherWindow?.webContents.send('updater-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  launcherWindow?.webContents.send('updater-status', { status: 'update-available', info });
});

autoUpdater.on('update-not-available', (info) => {
  launcherWindow?.webContents.send('updater-status', { status: 'update-not-available', info });
});

autoUpdater.on('error', (err) => {
  launcherWindow?.webContents.send('updater-status', { status: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  launcherWindow?.webContents.send('updater-status', { status: 'downloading', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
  launcherWindow?.webContents.send('updater-status', { status: 'update-downloaded', info });
});

// IPC API Bridge — Local Loopback Server for real WebSocket + HTTP support
let localServerPort: number | null = null;
let serverReady = false;

// Per-launch cryptographic bearer token — prevents same-machine lateral access
import crypto from 'crypto';
import { registerSandboxApiIpc } from './api-bridge';
const LOOPBACK_SECRET = crypto.randomBytes(32).toString('hex');

function loadTestEnv() {
  const candidates = [
    path.join(process.resourcesPath, ".env"),
    path.join(app.getAppPath(), ".env"),
    path.join(process.cwd(), ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function ensureLocalServer(): Promise<number> {
  if (serverReady && localServerPort) return localServerPort;

  if (!process.env.ZENLECS_DATA_PATH) {
    process.env.ZENLECS_DATA_PATH = app.getPath('userData');
  }
  if (!process.env.ZENLECS_MIGRATIONS_PATH) {
    process.env.ZENLECS_MIGRATIONS_PATH = isDev
      ? path.join(app.getAppPath(), 'migrations')
      : path.join(__dirname, '../migrations');
  }

  loadTestEnv();

  // Inject the loopback secret into the server process so it can validate
  process.env.ZENOS_LOOPBACK_SECRET = LOOPBACK_SECRET;
  if (app.isPackaged) {
    process.env.NODE_ENV = "production";
  }

  const serverModule = await import('../server/index.ts');
  await serverModule.initPromise;

  // Start real loopback HTTP server so WebSocket (/ws) actually works
  const port = await new Promise<number>((resolve, reject) => {
    const httpServer = serverModule.httpServer;
    // Bind to 127.0.0.1 only — never exposed to network
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Failed to bind loopback server'));
      }
    });
  });

  localServerPort = port;
  serverReady = true;
  console.log(`[ZenOS] Local loopback server started on 127.0.0.1:${port}`);
  return port;
}

// Expose local server port AND bearer token to renderer for secure connections
ipcMain.handle('get-local-server-port', async () => {
  const port = await ensureLocalServer();
  return { port, token: LOOPBACK_SECRET };
});

/** Renderer'dan gelen ham cookie başlığını oturum kavanozuyla birleştirir. */
function bridgeCookieHeader(headers: unknown): string | undefined {
  const rawCookie = (headers as Record<string, unknown> | undefined)?.cookie;
  return mergeCookieHeader(rawCookie === undefined ? undefined : String(rawCookie));
}

// Tüm API kanalları (tamponlu, akış ve iptal) tek yerden kaydedilir.
registerSandboxApiIpc(ipcMain, {
  getBaseUrl: async () => `http://127.0.0.1:${await ensureLocalServer()}`,
  token: LOOPBACK_SECRET,
  resolveCookie: bridgeCookieHeader,
  onSetCookies: parseSetCookieHeaders,
  onError: (scope, error) => console.error(`IPC ${scope} Error:`, error),
});
