/**
 * NX AI - Native Windows Desktop Application Container (Electron Main Process)
 * Supports:
 * - 1920x1080 Native Workstation Window
 * - Transparent Floating Desktop Companion overlay
 * - Global Hotkey (Alt+Space) to wake NX AI
 * - System Tray integration
 */

const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let companionWindow = null;
let tray = null;
let serverProcess = null;

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

function startBackendServer() {
  try {
    // Check if server is already running
    const testReq = require('http').get(SERVER_URL, () => {
      console.log('[NX AI Desktop] Backend server already running on', SERVER_URL);
    });
    testReq.on('error', () => {
      console.log('[NX AI Desktop] Spawning local Express/Vite backend server...');
      serverProcess = spawn('npx', ['tsx', 'server.ts'], {
        cwd: __dirname,
        shell: true,
        stdio: 'inherit',
      });
    });
  } catch (err) {
    console.error('[NX AI Desktop] Error checking backend server:', err);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    title: 'NX AI — Autonomous Windows Agent & Desktop Companion',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    frame: true,
    backgroundColor: '#0c1017',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of hard quitting if user prefers
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'public', 'favicon.ico'));
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'NX AI Workstation Kholo',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Companion Samne Aao',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('nx-companion-command', 'restore');
            mainWindow.show();
          }
        },
      },
      {
        label: 'Side Mein Chup Jao',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('nx-companion-command', 'dock_side');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit NX AI',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip('NX AI — Autonomous Windows Agent');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch {
    // tray optional if icon missing in sandbox
  }
}

app.whenReady().then(() => {
  startBackendServer();
  setTimeout(() => {
    createMainWindow();
    createTray();

    // Register Global Hotkey: Alt+Space to toggle NX AI
    globalShortcut.register('Alt+Space', () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('nx-voice-wake');
        }
      }
    });
  }, 1000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
