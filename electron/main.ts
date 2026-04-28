import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { initDb } from './db';
import { registerIpc } from './ipc/handlers';
import { startScheduler } from './scheduler';
import { syncFromRemote } from './scheduler/timer';
import { startIdleService } from './services/idle';

const REMOTE_SYNC_INTERVAL_MS = 60_000;
let remoteSyncTimer: NodeJS.Timeout | null = null;

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
const getWindow = () => mainWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f1115',
    title: 'Helm',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // __dirname at runtime is dist-electron/electron/; the vite build output
    // lives at <project>/dist so we hop up two levels.
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater(): void {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    console.error('[auto-update] error:', err);
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[auto-update] available: ${info.version}, downloading in background`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[auto-update] up to date');
  });
  autoUpdater.on('update-downloaded', async (info) => {
    const w = getWindow();
    const opts = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Helm ${info.version} is ready to install.`,
      detail:
        'Click "Restart now" to apply the update immediately, or "Later" to install automatically when you quit Helm.',
    };
    const result = w
      ? await dialog.showMessageBox(w, opts)
      : await dialog.showMessageBox(opts);
    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[auto-update] check failed:', err);
  });
}

app.whenReady().then(() => {
  // Required on Windows for native Notifications to render with the right
  // identity. Must match electron-builder's appId.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.alon.helm');
  }
  initDb();
  registerIpc(getWindow);
  createWindow();
  startScheduler();
  startIdleService();
  setupAutoUpdater();

  // Reconcile with whatever ClickUp says is running (covers timers started from
  // the web/mobile clients). One sync immediately after the DB is up, then every
  // minute while the app is open.
  syncFromRemote().catch(() => {
    /* swallow — bootstrap may not be ready yet */
  });
  remoteSyncTimer = setInterval(() => {
    syncFromRemote().catch(() => {
      /* logged upstream */
    });
  }, REMOTE_SYNC_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (remoteSyncTimer) clearInterval(remoteSyncTimer);
  if (process.platform !== 'darwin') app.quit();
});
