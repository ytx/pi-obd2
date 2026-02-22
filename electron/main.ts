import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { StubSource } from './obd/stub-source';
import { ELM327Source } from './obd/elm327-source';
import { DataSource } from './obd/data-source';
import { getAllPidInfos } from './obd/pids';
import { StubPidConfig, StubProfileName } from './obd/types';

let mainWindow: BrowserWindow | null = null;
let dataSource: DataSource | null = null;
let isStubMode = true; // Default to stub for development

// CPU usage tracking
let prevCpuIdle = 0;
let prevCpuTotal = 0;

function getCpuUsagePercent(): number {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf-8');
    const line = stat.split('\n')[0];
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3];
    const total = parts.reduce((a, b) => a + b, 0);
    const diffIdle = idle - prevCpuIdle;
    const diffTotal = total - prevCpuTotal;
    prevCpuIdle = idle;
    prevCpuTotal = total;
    if (diffTotal === 0) return 0;
    return Math.round((1 - diffIdle / diffTotal) * 100);
  } catch {
    return 0;
  }
}

function getCpuTemperature(): number {
  try {
    const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
    return Math.round(parseInt(temp) / 100) / 10;
  } catch {
    return 0;
  }
}

function getDataSource(): DataSource {
  if (!dataSource) {
    if (isStubMode) {
      dataSource = new StubSource();
    } else {
      dataSource = new ELM327Source();
    }
    // Forward data and connection events to renderer
    dataSource.onData((values) => {
      mainWindow?.webContents.send('obd-data', values);
    });
    dataSource.onConnectionChange((state) => {
      mainWindow?.webContents.send('obd-connection-change', state);
    });
  }
  return dataSource;
}

function createWindow(): void {
  const isPackaged = app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 600,
    kiosk: isPackaged,
    fullscreen: isPackaged,
    frame: !isPackaged,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
function registerIpcHandlers(): void {
  ipcMain.handle('get-hostname', () => os.hostname());

  ipcMain.handle('get-system-stats', () => ({
    cpuUsage: getCpuUsagePercent(),
    cpuTemp: getCpuTemperature(),
    memTotal: Math.round(os.totalmem() / 1024 / 1024),
    memFree: Math.round(os.freemem() / 1024 / 1024),
    uptime: Math.round(os.uptime()),
  }));

  ipcMain.handle('system-shutdown', () => {
    try {
      execSync('sudo shutdown -h now');
    } catch (e) {
      console.error('Shutdown failed:', e);
    }
  });

  ipcMain.handle('system-reboot', () => {
    try {
      execSync('sudo reboot');
    } catch (e) {
      console.error('Reboot failed:', e);
    }
  });

  ipcMain.handle('save-config', () => {
    try {
      execSync('/boot/firmware/config/save.sh --all');
      return true;
    } catch (e) {
      console.error('Save config failed:', e);
      return false;
    }
  });

  // --- OBD2 IPC ---
  ipcMain.handle('obd-connect', async () => {
    const ds = getDataSource();
    await ds.connect();
  });

  ipcMain.handle('obd-disconnect', async () => {
    if (dataSource) {
      await dataSource.disconnect();
    }
  });

  ipcMain.handle('obd-get-state', () => {
    return dataSource?.getState() ?? 'disconnected';
  });

  ipcMain.handle('obd-get-available-pids', () => {
    return getAllPidInfos();
  });

  ipcMain.handle('obd-set-polling-pids', (_event, pids: string[]) => {
    dataSource?.requestPids(pids);
  });

  ipcMain.handle('obd-is-stub-mode', () => {
    return isStubMode;
  });

  // --- Stub-specific IPC ---
  ipcMain.handle('stub-get-profiles', () => {
    if (!(dataSource instanceof StubSource)) {
      const stub = new StubSource();
      const names = stub.getProfileNames();
      stub.dispose();
      return names;
    }
    return (dataSource as StubSource).getProfileNames();
  });

  ipcMain.handle('stub-set-profile', (_event, name: StubProfileName) => {
    if (dataSource instanceof StubSource) {
      (dataSource as StubSource).setProfile(name);
    }
  });

  ipcMain.handle('stub-set-pid-config', (_event, pid: string, config: StubPidConfig) => {
    if (dataSource instanceof StubSource) {
      (dataSource as StubSource).setPidConfig(pid, config);
    }
  });

  ipcMain.handle('stub-get-config', () => {
    if (dataSource instanceof StubSource) {
      return (dataSource as StubSource).getConfig();
    }
    return null;
  });
}

app.whenReady().then(() => {
  // Check environment variable for mode
  if (process.env.OBD2_MODE === 'real') {
    isStubMode = false;
  }
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (dataSource) {
    dataSource.dispose();
    dataSource = null;
  }
  app.quit();
});
