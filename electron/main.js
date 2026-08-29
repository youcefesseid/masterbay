import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPackaged = app.isPackaged;
const ROOT = isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked')
  : path.resolve(__dirname, '..');
const PORT = process.env.PORT || 4173;
const LOG_DIR = isPackaged ? app.getPath('userData') : ROOT;
const LOG_PATH = path.join(LOG_DIR, 'masterbay-electron.log');

try { fs.writeFileSync(LOG_PATH, '=== Masterbay Electron starting ===\n'); } catch (e) { console.error('LOG WRITE FAILED', e); }

let mainWindow = null;
let server = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Masterbay',
    icon: path.join(ROOT, 'public', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function waitForServer(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/healthz`);
        if (response.ok) {
          resolve();
        } else {
          throw new Error('Health check failed');
        }
      } catch {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 200);
        }
      }
    };
    check();
  });
}

async function startServer() {
  // Set FFmpeg paths for the server
  const bundledBin = isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(ROOT, 'electron', 'bin');
  const ffmpegPath = path.join(bundledBin, 'ffmpeg.exe');
  const ffprobePath = path.join(bundledBin, 'ffprobe.exe');

  try {
    if (await fs.promises.access(ffmpegPath).then(() => true, () => false)) {
      process.env.FFMPEG_PATH = ffmpegPath;
    }
    if (await fs.promises.access(ffprobePath).then(() => true, () => false)) {
      process.env.FFPROBE_PATH = ffprobePath;
    }
  } catch {}

  // Import and start the server directly in this process
  const serverEntry = path.join(ROOT, 'server.js');
  console.log('Starting server: ' + serverEntry);
  console.log('CWD: ' + ROOT);

  // Import the server module and start it - use file:// URL for Windows
  const serverUrl = 'file://' + serverEntry.replace(/\\/g, '/');
  const serverModule = await import(serverUrl);
  // The server.js runs main() on import, but we need to ensure it's started
  // server.js calls main() at the bottom, so it starts automatically
  
  await waitForServer();
}

async function startApp() {
  await startServer();
  createWindow();
}

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── Auto-update check (GitHub Releases, no extra deps) ──
const REPO = 'youcefesseid07/masterbay';
const CURRENT_VERSION = '1.0.0';

async function checkForUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Masterbay' },
    });
    if (!res.ok) return;
    const release = await res.json();
    const latest = (release.tag_name || '').replace(/^v/, '');
    if (!latest) return;

    const [a, b, c] = latest.split('.').map(Number);
    const [x, y, z] = CURRENT_VERSION.split('.').map(Number);
    const newer = a > x || (a === x && b > y) || (a === x && b === y && c > z);
    if (!newer) return;

    const portable = (release.assets || []).find((a) => a.name.includes('Portable'));
    if (mainWindow && !mainWindow.isDestroyed() && portable) {
      mainWindow.webContents.send('update-available', {
        version: latest,
        url: portable.browser_download_url,
        notes: release.body || '',
      });
    }
  } catch {
    // Network errors are non-fatal; ignore
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (server) {
      server.close();
    }
    app.quit();
  });
}

// Check for updates a few seconds after launch (only in packaged mode)
if (isPackaged) {
  setTimeout(checkForUpdate, 8000);
}
