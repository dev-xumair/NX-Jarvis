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
let clickThroughEnabled = false;

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
      preload: path.join(__dirname, 'electron-preload.cjs'),
      sandbox: true,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of hard quitting if user prefers
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      // Ensure companion window stays visible on desktop when main window is hidden
      if (companionWindow && !companionWindow.isDestroyed()) {
        companionWindow.show();
      }
    }
    return false;
  });
}

function createCompanionOverlayWindow() {
  companionWindow = new BrowserWindow({
    width: 340,
    height: 480,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'electron-preload.cjs'),
      sandbox: true,
    },
  });

  companionWindow.loadURL(`${SERVER_URL}/?overlay=true`);

  // IPC Event Forwarding & Sync between Windows
  ipcMain.on('companion-clickthrough-toggle', (event, enable) => {
    clickThroughEnabled = enable;
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
    }
  });

  ipcMain.on('companion-move', (event, { x, y }) => {
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.setPosition(Math.round(x), Math.round(y));
    }
  });

  ipcMain.on('companion-resize', (event, { width, height }) => {
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.setSize(Math.round(width), Math.round(height));
    }
  });

  ipcMain.on('companion-visibility', (event, isVisible) => {
    if (companionWindow && !companionWindow.isDestroyed()) {
      if (isVisible) companionWindow.show();
      else companionWindow.hide();
    }
  });

  ipcMain.on('character-event-broadcast', (event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('character-event', payload);
    }
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.webContents.send('character-event', payload);
    }
  });

  // Active Window Tracking Poller for Real Windows Application Attachment
  // Uses a persistent child process rather than spawning powershell every 500ms
  let attachedTargetPattern = null;
  let trackerProcess = null;
  let isTracking = false;

  ipcMain.on('companion-attach-window', (event, targetPattern) => {
    attachedTargetPattern = targetPattern || 'chrome';
    if (!isTracking && process.platform === 'win32') {
      isTracking = true;
      try {
        const psLoopScript = `
          Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect); public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }' -Name Win32 -Namespace Win32;
          while ($true) {
            $h = [Win32.Win32]::GetForegroundWindow();
            $r = New-Object Win32.Win32+RECT;
            [Win32.Win32]::GetWindowRect($h, [ref]$r);
            Write-Output ($r.Left.ToString() + ',' + $r.Top.ToString() + ',' + ($r.Right-$r.Left).ToString() + ',' + ($r.Bottom-$r.Top).ToString());
            Start-Sleep -Milliseconds 600;
          }
        `;
        trackerProcess = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psLoopScript], {
          shell: false,
          windowsHide: true,
        });

        trackerProcess.stdout.on('data', (data) => {
          if (!companionWindow || companionWindow.isDestroyed() || !isTracking) return;
          const lines = data.toString().trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const parts = lastLine.trim().split(',');
          if (parts.length === 4) {
            const [wx, wy, ww, wh] = parts.map(Number);
            if (ww > 200 && wh > 150) {
              const targetX = Math.round(wx + ww - 320);
              const targetY = Math.max(10, Math.round(wy - 40));
              companionWindow.setPosition(targetX, targetY);
            }
          }
        });

        trackerProcess.on('exit', () => {
          isTracking = false;
        });
      } catch (err) {
        console.warn('[NX AI Window Tracker] Error starting tracker process:', err);
      }
    }
  });

  ipcMain.on('companion-detach-window', () => {
    attachedTargetPattern = null;
    isTracking = false;
    if (trackerProcess) {
      trackerProcess.kill();
      trackerProcess = null;
    }
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
    createCompanionOverlayWindow();
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

    // Register Alt+C to toggle Character companion
    globalShortcut.register('Alt+C', () => {
      if (companionWindow) {
        if (companionWindow.isVisible()) {
          companionWindow.hide();
        } else {
          companionWindow.show();
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
