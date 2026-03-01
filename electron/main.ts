import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { StubSource } from './obd/stub-source';
import { ELM327Source } from './obd/elm327-source';
import { DataSource } from './obd/data-source';
import { getAllPidInfos } from './obd/pids';
import { StubPidConfig, StubProfileName } from './obd/types';
import { scanThemes, loadTheme, resolveThemeDir, getThemesDir } from './themes/theme-loader';
import { BluetoothManager } from './bluetooth/bluetooth-manager';
import { WiFiManager } from './network/wifi-manager';
import { GpioManager } from './gpio/gpio-manager';
import { logger } from './logger';

const USB_MOUNT_POINT = '/mnt/obd2-usb';

let mainWindow: BrowserWindow | null = null;
const btManager = new BluetoothManager();
const wifiManager = new WiFiManager();
const gpioManager = new GpioManager();
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

function parseWindowSize(): { width: number; height: number } {
  const arg = process.argv.find((a) => a.startsWith('--window-size='));
  if (arg) {
    const parts = arg.split('=')[1].split(',').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return { width: parts[0], height: parts[1] };
    }
  }
  return { width: 1024, height: 600 };
}

function createWindow(): void {
  const isPackaged = app.isPackaged;
  const { width, height } = parseWindowSize();

  mainWindow = new BrowserWindow({
    width,
    height,
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
      logger.info('system', 'Shutdown requested');
      execSync('sudo shutdown -h now');
    } catch (e) {
      logger.error('system', `Shutdown failed: ${e}`);
    }
  });

  ipcMain.handle('system-reboot', () => {
    try {
      logger.info('system', 'Reboot requested');
      execSync('sudo reboot');
    } catch (e) {
      logger.error('system', `Reboot failed: ${e}`);
    }
  });

  ipcMain.handle('save-config', () => {
    try {
      logger.info('config', 'Saving config...');
      execSync('sudo /boot/firmware/config/save.sh --all');
      logger.info('config', 'Config saved');
      return { success: true };
    } catch (e) {
      logger.error('config', `Save config failed: ${e}`);
      return { success: false, error: String(e) };
    }
  });

  // --- OBD2 IPC ---
  ipcMain.handle('obd-connect', async (_event, devicePath?: string) => {
    logger.info('obd', `Connect requested (devicePath=${devicePath ?? 'none'}, stubMode=${isStubMode})`);
    // Disconnect existing connection first
    if (dataSource && dataSource.getState() !== 'disconnected') {
      logger.info('obd', 'Disconnecting existing connection before reconnect');
      await dataSource.disconnect();
    }
    // devicePath provided → switch to ELM327 mode if currently stub or no ELM327 instance
    if (devicePath) {
      if (isStubMode || !(dataSource instanceof ELM327Source)) {
        isStubMode = false;
        if (dataSource) {
          dataSource.dispose();
          dataSource = null;
        }
      }
    }
    const ds = getDataSource();
    // Fire-and-forget: connection progress is reported via obd-connection-change events
    ds.connect(devicePath ?? undefined).then(() => {
      logger.info('obd', `Connected (mode=${isStubMode ? 'stub' : 'elm327'})`);
    }).catch((err) => {
      logger.error('obd', `Connect failed: ${err}`);
    });
  });

  ipcMain.handle('obd-connect-stub', () => {
    logger.info('obd', 'Stub connect requested');
    if (dataSource) {
      dataSource.dispose();
      dataSource = null;
    }
    isStubMode = true;
    const ds = getDataSource();
    // Fire-and-forget
    ds.connect().then(() => {
      logger.info('obd', 'Connected (mode=stub)');
    }).catch((err) => {
      logger.error('obd', `Stub connect failed: ${err}`);
    });
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
      logger.error('usb', `detect-usb: ${err}`);
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
      logger.error('usb', `mount-usb: ${err}`);
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
      logger.error('usb', `unmount-usb: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('usb-export-config', (_event, configJson: string) => {
    try {
      const configPath = path.join(USB_MOUNT_POINT, 'obd2-config.json');
      fs.writeFileSync(configPath, configJson, 'utf-8');
      return { success: true };
    } catch (err) {
      logger.error('usb', `usb-export: ${err}`);
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
      logger.error('usb', `usb-import: ${err}`);
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
        logger.info('auto-mount', 'Auto-unmounted USB after theme load');
      } catch (err) {
        logger.error('auto-mount', `Auto-unmount failed: ${err}`);
      }
    }
    return data;
  });

  // --- Bluetooth IPC ---
  ipcMain.handle('bt-scan', async () => {
    try { return await btManager.scan(); } catch { return []; }
  });

  ipcMain.handle('bt-pair', async (_event, address: string) => {
    try { return await btManager.pair(address); } catch (e) { return { success: false, error: String(e) }; }
  });

  ipcMain.handle('bt-connect', async (_event, address: string) => {
    try { return await btManager.connect(address); } catch (e) { return { success: false, error: String(e) }; }
  });

  ipcMain.handle('bt-disconnect', async (_event, address: string) => {
    try { return await btManager.disconnect(address); } catch (e) { return { success: false, error: String(e) }; }
  });

  ipcMain.handle('bt-get-devices', async () => {
    try { return await btManager.getDevices(); } catch { return []; }
  });

  ipcMain.handle('bt-rfcomm-bind', async (_event, address: string) => {
    try { return await btManager.rfcommBind(address); } catch (e) { return { success: false, error: String(e) }; }
  });

  // --- Serial device scan IPC ---
  ipcMain.handle('serial-scan', () => {
    const devices: { path: string; type: string }[] = [];
    try {
      const entries = fs.readdirSync('/dev');
      for (const name of entries) {
        let type: string | null = null;
        if (/^rfcomm\d+$/.test(name)) type = 'rfcomm';
        else if (/^ttyUSB\d+$/.test(name)) type = 'ttyUSB';
        else if (/^ttyACM\d+$/.test(name)) type = 'ttyACM';
        else if (/^ttyOBD2$/.test(name)) type = 'ttyOBD2';
        else if (/^ttyS\d+$/.test(name)) {
          // Only include real serial ports (filter out virtual)
          const sysPath = `/sys/class/tty/${name}/device`;
          if (fs.existsSync(sysPath)) type = 'ttyS';
        }
        if (type) {
          devices.push({ path: `/dev/${name}`, type });
        }
      }
    } catch (err) {
      logger.error('serial', `serial-scan: ${err}`);
    }
    return devices;
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

  // --- Logger IPC ---
  ipcMain.handle('get-logs', () => {
    return logger.getLogs();
  });

  ipcMain.handle('save-logs-usb', () => {
    if (!usbMounted) return { success: false, error: 'USB not mounted' };
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(USB_MOUNT_POINT, `obd2-logs-${ts}.txt`);
      logger.saveLogs(filePath);
      logger.info('logs', `Saved to ${filePath}`);
      return { success: true, filePath };
    } catch (err) {
      logger.error('logs', `Save failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('log-settings', (_event, settings: Record<string, unknown>) => {
    logger.info('settings', JSON.stringify(settings));
  });

  ipcMain.handle('is-usb-mounted', () => {
    return usbMounted;
  });

  // --- Theme Editor IPC ---
  ipcMain.handle('theme-get-dirs', () => {
    const dirs: { path: string; label: string }[] = [];
    if (!app.isPackaged) {
      dirs.push({ path: getThemesDir(), label: 'Local (themes/)' });
    }
    if (usbMounted) {
      const usbThemes = path.join(USB_MOUNT_POINT, 'themes');
      if (fs.existsSync(usbThemes)) {
        dirs.push({ path: usbThemes, label: 'USB' });
      }
    }
    return dirs;
  });

  ipcMain.handle('theme-create', (_event, name: string, targetDir?: string) => {
    try {
      const baseDir = targetDir ?? getThemesDir();
      const themeDir = path.join(baseDir, name);
      if (fs.existsSync(themeDir)) {
        return { success: false, error: 'Theme directory already exists' };
      }
      fs.mkdirSync(themeDir, { recursive: true });
      fs.writeFileSync(path.join(themeDir, 'properties.txt'), '# Theme properties\n', 'utf-8');
      logger.info('theme-editor', `Created theme: ${name}`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Create theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-duplicate', (_event, sourceId: string, newName: string) => {
    try {
      const sourceDir = resolveThemeDir(sourceId, getUsbThemeDirs());
      if (!sourceDir) return { success: false, error: 'Source theme not found' };
      const parentDir = path.dirname(sourceDir);
      const destDir = path.join(parentDir, newName);
      if (fs.existsSync(destDir)) {
        return { success: false, error: 'Theme directory already exists' };
      }
      fs.cpSync(sourceDir, destDir, { recursive: true });
      logger.info('theme-editor', `Duplicated ${sourceId} → ${newName}`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Duplicate theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-delete', (_event, themeId: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      fs.rmSync(themeDir, { recursive: true, force: true });
      logger.info('theme-editor', `Deleted theme: ${themeId}`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Delete theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-rename', (_event, themeId: string, newName: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      const parentDir = path.dirname(themeDir);
      const newDir = path.join(parentDir, newName);
      if (fs.existsSync(newDir)) {
        return { success: false, error: 'Theme directory already exists' };
      }
      fs.renameSync(themeDir, newDir);
      logger.info('theme-editor', `Renamed ${themeId} → ${newName}`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Rename theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-save-properties', (_event, themeId: string, properties: Record<string, string>) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      const lines = Object.entries(properties).map(([k, v]) => `${k}=${v}`);
      fs.writeFileSync(path.join(themeDir, 'properties.txt'), lines.join('\n') + '\n', 'utf-8');
      logger.info('theme-editor', `Saved properties for ${themeId} (${lines.length} entries)`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Save properties failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-read-file', (_event, filePath: string, mimeType: string) => {
    try {
      const data = fs.readFileSync(filePath);
      if (mimeType === 'font') return data.toString('base64');
      return `data:${mimeType};base64,${data.toString('base64')}`;
    } catch (err) {
      logger.error('theme-editor', `Read file failed: ${err}`);
      return null;
    }
  });

  ipcMain.handle('theme-write-asset', (_event, themeId: string, assetName: string, base64Data: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      fs.writeFileSync(path.join(themeDir, assetName), Buffer.from(raw, 'base64'));
      logger.info('theme-editor', `Wrote asset ${assetName} to ${themeId}`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Write asset failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-pick-file', async (_event, filters: { name: string; extensions: string[] }[]) => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters,
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('theme-copy-asset', (_event, themeId: string, sourcePath: string, assetName: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      fs.copyFileSync(sourcePath, path.join(themeDir, assetName));
      logger.info('theme-editor', `Copied asset ${assetName} to ${themeId}`);
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Copy asset failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-delete-asset', (_event, themeId: string, assetName: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      const assetPath = path.join(themeDir, assetName);
      if (fs.existsSync(assetPath)) {
        fs.unlinkSync(assetPath);
        logger.info('theme-editor', `Deleted asset ${assetName} from ${themeId}`);
      }
      return { success: true };
    } catch (err) {
      logger.error('theme-editor', `Delete asset failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  // --- GPIO IPC ---
  ipcMain.handle('gpio-setup', (_event, pins: number[]) => {
    gpioManager.setup(pins);
  });

  ipcMain.handle('gpio-read', (_event, pin: number) => {
    return gpioManager.read(pin);
  });

  ipcMain.handle('gpio-set', (_event, pin: number, value: number) => {
    gpioManager.set(pin, value);
  });

  ipcMain.handle('gpio-usb-reset', async (_event, pin: number) => {
    logger.info('gpio', `USB reset: pin ${pin} LOW → 1s → HIGH`);
    gpioManager.set(pin, 0);
    await new Promise((r) => setTimeout(r, 1000));
    gpioManager.set(pin, 1);
  });
}

/** Auto-mount USB if a device is present (for theme/config restoration after reboot) */
function autoMountUsb(): void {
  // Check if already mounted
  try {
    execSync(`mountpoint -q ${USB_MOUNT_POINT}`, { stdio: 'pipe' });
    usbMounted = true;
    usbAutoMounted = true;
    logger.info('auto-mount', 'Already mounted');
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
              logger.info('auto-mount', `Mounted ${device} to ${USB_MOUNT_POINT}`);
              return;
            } catch (err) {
              logger.error('auto-mount', `Failed to mount ${device}: ${err}`);
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error('auto-mount', `USB detection failed: ${err}`);
  }
}

app.whenReady().then(() => {
  // Check environment variable for mode
  if (process.env.OBD2_MODE === 'real') {
    isStubMode = false;
  }
  logger.info('app', `Starting (mode=${isStubMode ? 'stub' : 'real'}, packaged=${app.isPackaged})`);
  autoMountUsb();
  logger.info('app', `USB mounted=${usbMounted}`);
  registerIpcHandlers();
  // Forward GPIO changes to renderer
  gpioManager.onChange((event) => {
    mainWindow?.webContents.send('gpio-change', event);
  });
  createWindow();
});

function cleanupAndQuit(): void {
  if (dataSource) {
    dataSource.dispose();
    dataSource = null;
  }
  gpioManager.dispose();
}

app.on('window-all-closed', () => {
  cleanupAndQuit();
  app.quit();
});

// Ensure ELM327 DTR reset on SIGINT/SIGTERM (e.g. Ctrl+C)
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info('app', `Received ${sig}, cleaning up...`);
    cleanupAndQuit();
    process.exit(0);
  });
}
