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
import { scanThemes, loadTheme } from './themes/theme-loader';
import { BluetoothManager } from './bluetooth/bluetooth-manager';
import { WiFiManager } from './network/wifi-manager';

const USB_MOUNT_POINT = '/mnt/obd2-usb';

let mainWindow: BrowserWindow | null = null;
const btManager = new BluetoothManager();
const wifiManager = new WiFiManager();
let usbMounted = false;
let usbAutoMounted = false;  // true when mounted by autoMountUsb (will auto-unmount after theme-load)
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

  // --- USB IPC ---
  ipcMain.handle('detect-usb', () => {
    try {
      const output = execSync('lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,TRAN,RM', { encoding: 'utf-8' });
      const data = JSON.parse(output);
      const devices: { device: string; size: string; mountpoint: string | null }[] = [];
      for (const dev of data.blockdevices) {
        if (dev.tran === 'usb' && dev.rm) {
          if (dev.children) {
            for (const part of dev.children) {
              if (part.type === 'part') {
                devices.push({
                  device: `/dev/${part.name}`,
                  size: part.size,
                  mountpoint: part.mountpoint || null,
                });
              }
            }
          }
        }
      }
      return devices;
    } catch (err) {
      console.error('[detect-usb]', err);
      return [];
    }
  });

  ipcMain.handle('mount-usb', (_event, device: string) => {
    if (!/^\/dev\/sd[a-z]\d+$/.test(device)) {
      return { success: false, error: 'Invalid device path' };
    }
    try {
      execSync(`sudo mkdir -p ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
      const uid = process.getuid?.() ?? 1000;
      const gid = process.getgid?.() ?? 1000;
      execSync(`sudo mount -t vfat -o uid=${uid},gid=${gid} ${device} ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
      usbMounted = true;
      return { success: true, mountpoint: USB_MOUNT_POINT };
    } catch (err) {
      console.error('[mount-usb]', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('unmount-usb', () => {
    try {
      execSync(`sudo umount ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
      usbMounted = false;
      return { success: true };
    } catch (err) {
      usbMounted = false;
      console.error('[unmount-usb]', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('usb-export-config', (_event, configJson: string) => {
    try {
      const configPath = path.join(USB_MOUNT_POINT, 'obd2-config.json');
      fs.writeFileSync(configPath, configJson, 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('[usb-export]', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('usb-import-config', () => {
    try {
      const configPath = path.join(USB_MOUNT_POINT, 'obd2-config.json');
      if (!fs.existsSync(configPath)) {
        return { success: false, error: 'obd2-config.json not found' };
      }
      const data = fs.readFileSync(configPath, 'utf-8');
      return { success: true, data };
    } catch (err) {
      console.error('[usb-import]', err);
      return { success: false, error: String(err) };
    }
  });

  // --- Theme IPC ---
  function getUsbThemeDirs(): string[] {
    if (!usbMounted) return [];
    const usbThemes = path.join(USB_MOUNT_POINT, 'themes');
    return fs.existsSync(usbThemes) ? [usbThemes] : [];
  }

  ipcMain.handle('theme-list', () => {
    return scanThemes(getUsbThemeDirs());
  });

  ipcMain.handle('theme-load', (_event, themeId: string) => {
    const data = loadTheme(themeId, getUsbThemeDirs());
    // Auto-unmount USB after startup theme restoration (data is fully in memory)
    if (usbAutoMounted) {
      usbAutoMounted = false;
      try {
        execSync(`sudo umount ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
        usbMounted = false;
        console.log('[auto-mount] Auto-unmounted USB after theme load');
      } catch (err) {
        console.error('[auto-mount] Auto-unmount failed:', err);
      }
    }
    return data;
  });

  // --- Bluetooth IPC ---
  ipcMain.handle('bt-scan', async () => {
    try { return await btManager.scan(); } catch { return []; }
  });

  ipcMain.handle('bt-pair', async (_event, address: string) => {
    try { return await btManager.pair(address); } catch { return false; }
  });

  ipcMain.handle('bt-connect', async (_event, address: string) => {
    try { return await btManager.connect(address); } catch { return false; }
  });

  ipcMain.handle('bt-disconnect', async (_event, address: string) => {
    try { return await btManager.disconnect(address); } catch { return false; }
  });

  ipcMain.handle('bt-get-devices', async () => {
    try { return await btManager.getDevices(); } catch { return []; }
  });

  // --- WiFi IPC ---
  ipcMain.handle('wifi-scan', async () => {
    try { return await wifiManager.scan(); } catch { return []; }
  });

  ipcMain.handle('wifi-connect', async (_event, ssid: string, password: string) => {
    try { return await wifiManager.connect(ssid, password); } catch { return false; }
  });

  ipcMain.handle('wifi-disconnect', async () => {
    try { return await wifiManager.disconnect(); } catch { return false; }
  });

  ipcMain.handle('wifi-get-current', async () => {
    try { return await wifiManager.getCurrentSsid(); } catch { return null; }
  });
}

/** Auto-mount USB if a device is present (for theme/config restoration after reboot) */
function autoMountUsb(): void {
  // Check if already mounted
  try {
    execSync(`mountpoint -q ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
    usbMounted = true;
    usbAutoMounted = true;
    console.log('[auto-mount] Already mounted');
    return;
  } catch {
    // Not mounted — try to detect and mount
  }

  try {
    const output = execSync('lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,TRAN,RM', { encoding: 'utf-8' });
    const data = JSON.parse(output);
    for (const dev of data.blockdevices) {
      if (dev.tran === 'usb' && dev.rm && dev.children) {
        for (const part of dev.children) {
          if (part.type === 'part' && !part.mountpoint) {
            const device = `/dev/${part.name}`;
            try {
              execSync(`sudo mkdir -p ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
              const uid = process.getuid?.() ?? 1000;
              const gid = process.getgid?.() ?? 1000;
              execSync(`sudo mount -t vfat -o uid=${uid},gid=${gid} ${device} ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
              usbMounted = true;
              usbAutoMounted = true;
              console.log(`[auto-mount] Mounted ${device} to ${USB_MOUNT_POINT}`);
              return;
            } catch (err) {
              console.error(`[auto-mount] Failed to mount ${device}:`, err);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[auto-mount] USB detection failed:', err);
  }
}

app.whenReady().then(() => {
  // Check environment variable for mode
  if (process.env.OBD2_MODE === 'real') {
    isStubMode = false;
  }
  autoMountUsb();
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
