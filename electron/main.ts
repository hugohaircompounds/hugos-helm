import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { initDb } from './db';
import { registerIpc } from './ipc/handlers';
import { startScheduler } from './scheduler';
import { syncFromRemote } from './scheduler/timer';

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

app.whenReady().then(() => {
  initDb();
  registerIpc(getWindow);
  createWindow();
  startScheduler();

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
