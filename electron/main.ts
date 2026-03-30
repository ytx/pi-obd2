import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync, spawn as cpSpawn, ChildProcess } from 'child_process';
import { StubSource } from './obd/stub-source';
import { ELM327Source } from './obd/elm327-source';
import { DataSource } from './obd/data-source';
import { getAllPidInfos } from './obd/pids';
import { getAllGpsPidInfos } from './gps/gps-pids';
import { getAllTpmsPidInfos } from './tpms/tpms-pids';
import { TpmsSource, TirePosition } from './tpms/tpms-source';
import { BleTpmsSource } from './tpms/ble-tpms-source';
import { StubTpmsSource } from './tpms/stub-tpms-source';
import { GpsSource } from './gps/gps-source';
import { SerialGpsSource } from './gps/serial-gps-source';
import { StubGpsSource } from './gps/stub-gps-source';
import { StubPidConfig, StubProfileName } from './obd/types';
import { scanThemes, loadTheme, resolveThemeDir, getThemesDir } from './themes/theme-loader';
import { BluetoothManager } from './bluetooth/bluetooth-manager';
import { WiFiManager } from './network/wifi-manager';
import { GpioManager } from './gpio/gpio-manager';
import { logger } from './logger';
import { TerminalManager } from './terminal/terminal-manager';
import { CaptureManager } from './capture/capture-manager';
import { UsbManager } from './usb/usb-manager';
import { ConfigManager, OBD2Config, OBD2Settings, OBD2Status } from './usb/config-manager';

// Register custom protocol for serving local PMTiles with Range request support
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-tiles', privileges: { supportFetchAPI: true, stream: true } },
]);

let mainWindow: BrowserWindow | null = null;
const btManager = new BluetoothManager();
const wifiManager = new WiFiManager();
const gpioManager = new GpioManager();
const usbManager = new UsbManager();
const configManager = new ConfigManager(usbManager);
let dataSource: DataSource | null = null;
let isStubMode = true; // Default to stub for development
let usbResetCount = 0; // Consecutive USB resets without a successful connection
const USB_RESET_MAX = 3; // Max consecutive resets before giving up
let usbResetInProgress = false; // Prevent overlapping resets

// Terminal
let terminalManager: TerminalManager | null = null;

// Tiles download
let tilesDownloadProcess: ChildProcess | null = null;

// GPS source
let gpsSource: GpsSource | null = null;
let isGpsStubMode = false;

// TPMS source
let tpmsSource: TpmsSource | null = null;
let isTpmsStubMode = false;

// Capture
const captureManager = new CaptureManager();

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
      captureManager.write('obd', values);
    });
    let previousState: string = 'disconnected';
    dataSource.onConnectionChange((state) => {
      mainWindow?.webContents.send('obd-connection-change', state);
      if (state === 'connected') {
        usbResetCount = 0; // Successful connection — reset the counter
      } else if (state === 'error') {
        if (previousState === 'connecting') {
          // Connect/init failed — ELM327 not responding, USB reset may help
          handleUsbReset();
        }
        // Poll errors: stay in error state, no auto-reconnect.
        // DashboardScreen will reconnect on next mount (navigate away and back).
      }
      previousState = state;
    });
  }
  return dataSource;
}

function getGpsSource(): GpsSource {
  if (!gpsSource) {
    if (isGpsStubMode) {
      gpsSource = new StubGpsSource();
    } else {
      gpsSource = new SerialGpsSource();
    }
    gpsSource.onData((values) => {
      mainWindow?.webContents.send('gps-data', values);
      captureManager.write('gps', values);
    });
    gpsSource.onConnectionChange((state) => {
      mainWindow?.webContents.send('gps-connection-change', state);
    });
  }
  return gpsSource;
}

function getTpmsSource(): TpmsSource {
  if (!tpmsSource) {
    if (isTpmsStubMode) {
      tpmsSource = new StubTpmsSource();
    } else {
      tpmsSource = new BleTpmsSource();
    }
    tpmsSource.onData((values) => {
      mainWindow?.webContents.send('tpms-data', values);
      captureManager.write('tpms', values);
    });
    tpmsSource.onConnectionChange((state) => {
      mainWindow?.webContents.send('tpms-connection-change', state);
    });
    tpmsSource.onSensorDiscovered((sensor) => {
      mainWindow?.webContents.send('tpms-sensor-discovered', sensor);
    });
  }
  return tpmsSource;
}

// USB reset pin and device path — set by renderer via IPC at startup
let lastUsbResetPin: number | null = null;
let lastObdDevicePath: string | null = null;

async function handleUsbReset(): Promise<void> {
  if (lastUsbResetPin === null || lastObdDevicePath === null) return;
  if (usbResetInProgress) {
    logger.info('obd', 'USB reset skipped (already in progress)');
    return;
  }
  if (usbResetCount >= USB_RESET_MAX) {
    logger.info('obd', `USB reset skipped (${usbResetCount}/${USB_RESET_MAX} consecutive resets, giving up)`);
    return;
  }
  usbResetInProgress = true;
  usbResetCount++;
  logger.info('obd', `USB reset ${usbResetCount}/${USB_RESET_MAX}: pin ${lastUsbResetPin} LOW → 1s → HIGH, then reconnect`);
  gpioManager.set(lastUsbResetPin, 0);
  await new Promise((r) => setTimeout(r, 1000));
  gpioManager.set(lastUsbResetPin, 1);
  await new Promise((r) => setTimeout(r, 3000));
  // Reconnect
  logger.info('obd', `USB reset done, reconnecting to ${lastObdDevicePath}`);
  if (dataSource && dataSource.getState() !== 'disconnected') {
    await dataSource.disconnect();
  }
  usbResetInProgress = false;
  const ds = getDataSource();
  ds.connect(lastObdDevicePath).catch((err) => {
    logger.error('obd', `USB reset reconnect failed: ${err}`);
  });
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
      execSync('sudo /boot/firmware/config/save.sh --all', { stdio: 'pipe' });
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
    if (devicePath) lastObdDevicePath = devicePath;
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
    return [...getAllPidInfos(), ...getAllGpsPidInfos(), ...getAllTpmsPidInfos()];
  });

  ipcMain.handle('obd-set-polling-pids', (_event, pids: string[]) => {
    dataSource?.requestPids(pids);
  });

  ipcMain.handle('obd-is-stub-mode', () => {
    return isStubMode;
  });

  ipcMain.handle('dtc-read', async () => {
    const ds = dataSource;
    if (!ds) return [];
    try {
      return await ds.readDtc();
    } catch (err) {
      logger.error('dtc', `dtc-read failed: ${err}`);
      return [];
    }
  });

  ipcMain.handle('dtc-clear', async () => {
    const ds = dataSource;
    if (!ds) return;
    try {
      await ds.clearDtc();
    } catch (err) {
      logger.error('dtc', `dtc-clear failed: ${err}`);
    }
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
    // Sync GPS stub profile: idle→stationary, city→driving, highway→highway
    if (gpsSource instanceof StubGpsSource) {
      const gpsProfile = name === 'idle' ? 'stationary' : name === 'city' ? 'driving' : 'highway';
      (gpsSource as StubGpsSource).setProfile(gpsProfile);
    }
    // Sync TPMS stub profile
    if (tpmsSource instanceof StubTpmsSource) {
      const tpmsProfile = name === 'idle' ? 'stationary' : name === 'city' ? 'driving' : 'highway';
      (tpmsSource as StubTpmsSource).setProfile(tpmsProfile);
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
  ipcMain.handle('usb-get-state', () => {
    return { state: usbManager.getState(), device: usbManager.getDevice() };
  });

  // --- Config IPC (3-file split: config / settings / status) ---
  ipcMain.handle('config-load', () => {
    const config = configManager.readLatestConfig();
    logger.info('config', `config-load: ${config ? `v${config.version}, keys=${Object.keys(config).join(',')}` : 'null'}`);
    return config;
  });

  ipcMain.handle('settings-load', () => {
    const settings = configManager.readLatestSettings();
    logger.info('config', `settings-load: ${settings ? `v${settings.version}` : 'null'}`);
    return settings;
  });

  ipcMain.handle('status-load', () => {
    const status = configManager.readLatestStatus();
    logger.info('config', `status-load: ${status ? `v${status.version}` : 'null'}`);
    return status;
  });

  ipcMain.handle('config-save', async (_event, data: Record<string, unknown>) => {
    return configManager.writeConfig(data as unknown as OBD2Config);
  });

  ipcMain.handle('settings-status-save', async (_event, settings: Record<string, unknown>, status: Record<string, unknown>) => {
    return configManager.writeSettingsAndStatus(settings as unknown as OBD2Settings, status as unknown as OBD2Status);
  });

  // --- Theme IPC ---
  const USB_MOUNT_POINT = usbManager.getMountPoint();

  function getUsbThemeDirs(): string[] {
    if (!usbManager.isMounted()) return [];
    const usbThemes = path.join(USB_MOUNT_POINT, 'themes');
    return fs.existsSync(usbThemes) ? [usbThemes] : [];
  }

  ipcMain.handle('theme-list', () => {
    return scanThemes(getUsbThemeDirs());
  });

  ipcMain.handle('theme-load', (_event, themeId: string) => {
    return loadTheme(themeId, getUsbThemeDirs());
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
        else if (/^ttyGPS$/.test(name)) type = 'ttyGPS';
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

  // --- GPS IPC ---
  ipcMain.handle('gps-connect', async (_event, devicePath?: string) => {
    logger.info('gps', `Connect requested (devicePath=${devicePath ?? 'none'})`);
    if (gpsSource && gpsSource.getState() !== 'disconnected') {
      await gpsSource.disconnect();
    }
    if (devicePath) {
      if (isGpsStubMode || !(gpsSource instanceof SerialGpsSource)) {
        isGpsStubMode = false;
        if (gpsSource) {
          gpsSource.dispose();
          gpsSource = null;
        }
      }
    }
    const gs = getGpsSource();
    gs.connect(devicePath ?? undefined).then(() => {
      logger.info('gps', `Connected (mode=${isGpsStubMode ? 'stub' : 'serial'})`);
    }).catch((err) => {
      logger.error('gps', `Connect failed: ${err}`);
    });
  });

  ipcMain.handle('gps-connect-stub', () => {
    logger.info('gps', 'Stub connect requested');
    if (gpsSource) {
      gpsSource.dispose();
      gpsSource = null;
    }
    isGpsStubMode = true;
    const gs = getGpsSource();
    gs.connect().then(() => {
      logger.info('gps', 'Connected (mode=stub)');
    }).catch((err) => {
      logger.error('gps', `Stub connect failed: ${err}`);
    });
  });

  ipcMain.handle('gps-disconnect', async () => {
    if (gpsSource) {
      await gpsSource.disconnect();
    }
  });

  ipcMain.handle('gps-get-state', () => {
    return gpsSource?.getState() ?? 'disconnected';
  });

  ipcMain.handle('gps-is-stub-mode', () => {
    return isGpsStubMode;
  });

  // --- TPMS IPC ---
  ipcMain.handle('tpms-connect', async () => {
    logger.info('tpms', 'Connect requested');
    if (tpmsSource && tpmsSource.getState() !== 'disconnected') {
      await tpmsSource.disconnect();
    }
    if (!isTpmsStubMode || !(tpmsSource instanceof BleTpmsSource)) {
      if (!isTpmsStubMode && tpmsSource) {
        tpmsSource.dispose();
        tpmsSource = null;
      }
    }
    isTpmsStubMode = false;
    if (tpmsSource) {
      tpmsSource.dispose();
      tpmsSource = null;
    }
    const ts = getTpmsSource();
    ts.connect().then(() => {
      logger.info('tpms', `Connected (mode=${isTpmsStubMode ? 'stub' : 'ble'})`);
    }).catch((err) => {
      logger.error('tpms', `Connect failed: ${err}`);
    });
  });

  ipcMain.handle('tpms-connect-stub', () => {
    logger.info('tpms', 'Stub connect requested');
    if (tpmsSource) {
      tpmsSource.dispose();
      tpmsSource = null;
    }
    isTpmsStubMode = true;
    const ts = getTpmsSource();
    ts.connect().then(() => {
      logger.info('tpms', 'Connected (mode=stub)');
    }).catch((err) => {
      logger.error('tpms', `Stub connect failed: ${err}`);
    });
  });

  ipcMain.handle('tpms-disconnect', async () => {
    if (tpmsSource) {
      await tpmsSource.disconnect();
    }
  });

  ipcMain.handle('tpms-get-state', () => {
    return tpmsSource?.getState() ?? 'disconnected';
  });

  ipcMain.handle('tpms-is-stub-mode', () => {
    return isTpmsStubMode;
  });

  ipcMain.handle('tpms-get-sensors', () => {
    return tpmsSource?.getSensors() ?? [];
  });

  ipcMain.handle('tpms-assign-sensor', (_event, sensorId: string, position: string) => {
    tpmsSource?.assignSensor(sensorId, position as TirePosition);
  });

  ipcMain.handle('tpms-unassign-sensor', (_event, position: string) => {
    tpmsSource?.unassignSensor(position as TirePosition);
  });

  ipcMain.handle('tpms-get-assignments', () => {
    return tpmsSource?.getAssignments() ?? { FL: null, FR: null, RL: null, RR: null };
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

  ipcMain.handle('save-logs-usb', async () => {
    if (!usbManager.isMounted()) return { success: false, error: 'USB not mounted' };
    try {
      return await usbManager.withWriteAccess(async () => {
        const logsDir = path.join(USB_MOUNT_POINT, 'logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(logsDir, `obd2-logs-${ts}.txt`);
        logger.saveLogs(filePath);
        logger.info('logs', `Saved to ${filePath}`);
        return { success: true, filePath };
      });
    } catch (err) {
      logger.error('logs', `Save failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('log-settings', (_event, settings: Record<string, unknown>) => {
    logger.info('settings', JSON.stringify(settings));
  });

  // Removed: is-usb-mounted (use usb-get-state instead)

  // --- Theme Editor IPC ---
  ipcMain.handle('theme-get-dirs', () => {
    const dirs: { path: string; label: string }[] = [];
    if (!app.isPackaged) {
      dirs.push({ path: getThemesDir(), label: 'Local (themes/)' });
    }
    if (usbManager.isMounted()) {
      const usbThemes = path.join(USB_MOUNT_POINT, 'themes');
      if (fs.existsSync(usbThemes)) {
        dirs.push({ path: usbThemes, label: 'USB' });
      }
    }
    return dirs;
  });

  ipcMain.handle('theme-create', async (_event, name: string, targetDir?: string) => {
    const baseDir = targetDir ?? getThemesDir();
    const isUsb = baseDir.startsWith(USB_MOUNT_POINT);
    const doCreate = () => {
      const themeDir = path.join(baseDir, name);
      if (fs.existsSync(themeDir)) {
        return { success: false, error: 'Theme directory already exists' };
      }
      fs.mkdirSync(themeDir, { recursive: true });
      fs.writeFileSync(path.join(themeDir, 'properties.txt'), '# Theme properties\n', 'utf-8');
      logger.info('theme-editor', `Created theme: ${name}`);
      return { success: true };
    };
    try {
      if (isUsb) return await usbManager.withWriteAccess(async () => doCreate());
      return doCreate();
    } catch (err) {
      logger.error('theme-editor', `Create theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  // Helper: wrap fn in withWriteAccess if path is on USB
  async function withUsbWrite<T>(dirPath: string, fn: () => T): Promise<T> {
    if (dirPath.startsWith(USB_MOUNT_POINT)) {
      return usbManager.withWriteAccess(async () => fn());
    }
    return fn();
  }

  ipcMain.handle('theme-duplicate', async (_event, sourceId: string, newName: string) => {
    try {
      const sourceDir = resolveThemeDir(sourceId, getUsbThemeDirs());
      if (!sourceDir) return { success: false, error: 'Source theme not found' };
      const parentDir = path.dirname(sourceDir);
      const destDir = path.join(parentDir, newName);
      return await withUsbWrite(parentDir, () => {
        if (fs.existsSync(destDir)) {
          return { success: false, error: 'Theme directory already exists' };
        }
        fs.cpSync(sourceDir, destDir, { recursive: true });
        logger.info('theme-editor', `Duplicated ${sourceId} → ${newName}`);
        return { success: true };
      });
    } catch (err) {
      logger.error('theme-editor', `Duplicate theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-delete', async (_event, themeId: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      return await withUsbWrite(themeDir, () => {
        fs.rmSync(themeDir, { recursive: true, force: true });
        logger.info('theme-editor', `Deleted theme: ${themeId}`);
        return { success: true };
      });
    } catch (err) {
      logger.error('theme-editor', `Delete theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-rename', async (_event, themeId: string, newName: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      const parentDir = path.dirname(themeDir);
      return await withUsbWrite(parentDir, () => {
        const newDir = path.join(parentDir, newName);
        if (fs.existsSync(newDir)) {
          return { success: false, error: 'Theme directory already exists' };
        }
        fs.renameSync(themeDir, newDir);
        logger.info('theme-editor', `Renamed ${themeId} → ${newName}`);
        return { success: true };
      });
    } catch (err) {
      logger.error('theme-editor', `Rename theme failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-save-properties', async (_event, themeId: string, properties: Record<string, string>) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      return await withUsbWrite(themeDir, () => {
        const lines = Object.entries(properties).map(([k, v]) => `${k}=${v}`);
        fs.writeFileSync(path.join(themeDir, 'properties.txt'), lines.join('\n') + '\n', 'utf-8');
        logger.info('theme-editor', `Saved properties for ${themeId} (${lines.length} entries)`);
        return { success: true };
      });
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

  ipcMain.handle('theme-write-asset', async (_event, themeId: string, assetName: string, base64Data: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      return await withUsbWrite(themeDir, () => {
        const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        fs.writeFileSync(path.join(themeDir, assetName), Buffer.from(raw, 'base64'));
        logger.info('theme-editor', `Wrote asset ${assetName} to ${themeId}`);
        return { success: true };
      });
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

  ipcMain.handle('theme-copy-asset', async (_event, themeId: string, sourcePath: string, assetName: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      return await withUsbWrite(themeDir, () => {
        fs.copyFileSync(sourcePath, path.join(themeDir, assetName));
        logger.info('theme-editor', `Copied asset ${assetName} to ${themeId}`);
        return { success: true };
      });
    } catch (err) {
      logger.error('theme-editor', `Copy asset failed: ${err}`);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('theme-delete-asset', async (_event, themeId: string, assetName: string) => {
    try {
      const themeDir = resolveThemeDir(themeId, getUsbThemeDirs());
      if (!themeDir) return { success: false, error: 'Theme not found' };
      return await withUsbWrite(themeDir, () => {
        const assetPath = path.join(themeDir, assetName);
        if (fs.existsSync(assetPath)) {
          fs.unlinkSync(assetPath);
          logger.info('theme-editor', `Deleted asset ${assetName} from ${themeId}`);
        }
        return { success: true };
      });
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
    lastUsbResetPin = pin;
    logger.info('gpio', `USB reset: pin ${pin} LOW → 1s → HIGH`);
    gpioManager.set(pin, 0);
    await new Promise((r) => setTimeout(r, 1000));
    gpioManager.set(pin, 1);
  });

  ipcMain.handle('gpio-set-usb-reset-pin', (_event, pin: number | null) => {
    lastUsbResetPin = pin;
  });

  // --- Terminal IPC ---
  ipcMain.handle('terminal-spawn', (_event, cols: number, rows: number) => {
    if (terminalManager) {
      terminalManager.dispose();
    }
    terminalManager = new TerminalManager();
    terminalManager.onOutput((data) => {
      mainWindow?.webContents.send('terminal-output', data);
    });
    terminalManager.onExit((code) => {
      mainWindow?.webContents.send('terminal-exit', code);
    });
    terminalManager.spawn(cols, rows);
  });

  ipcMain.handle('terminal-write', (_event, data: string) => {
    terminalManager?.write(data);
  });

  ipcMain.handle('terminal-resize', (_event, cols: number, rows: number) => {
    terminalManager?.resize(cols, rows);
  });

  ipcMain.handle('terminal-kill', () => {
    terminalManager?.kill();
  });

  // --- Map IPC ---
  ipcMain.handle('map-list-tiles', () => {
    const dirs = [
      path.join(USB_MOUNT_POINT, 'tiles'),
      path.join(os.homedir(), 'tiles'),
      path.join(__dirname, '..', 'tiles'),
      path.join(__dirname, '..', 'scripts'),
    ];
    const files: { path: string; name: string; size: number }[] = [];
    for (const dir of dirs) {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (entry.endsWith('.pmtiles')) {
            const p = path.join(dir, entry);
            const stat = fs.statSync(p);
            files.push({ path: p, name: entry, size: stat.size });
          }
        }
      } catch { /* dir doesn't exist */ }
    }
    return files;
  });

  // --- Tiles Download ---

  ipcMain.handle('tiles-download', async (_event, bbox: [number, number, number, number], maxzoom: number) => {
    if (!usbManager.isMounted()) {
      return { success: false, error: 'USB not mounted' };
    }
    const pmtilesCmd = findPmtilesCli();
    if (!pmtilesCmd) {
      return { success: false, error: 'pmtiles CLI not found' };
    }

    try {
      await usbManager.acquireWrite();
    } catch (err) {
      return { success: false, error: `RW remount failed: ${err}` };
    }

    const tilesDir = path.join(USB_MOUNT_POINT, 'tiles');
    try { fs.mkdirSync(tilesDir, { recursive: true }); } catch { /* exists */ }

    const outputPath = path.join(tilesDir, 'map.pmtiles');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const sourceUrl = `https://build.protomaps.com/${today}.pmtiles`;
    const [west, south, east, north] = bbox;

    const args = [
      'extract', sourceUrl, outputPath,
      `--bbox=${west},${south},${east},${north}`,
      `--maxzoom=${maxzoom}`,
    ];

    logger.info('tiles', `Download: ${pmtilesCmd} ${args.join(' ')}`);

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const proc = cpSpawn(pmtilesCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      tilesDownloadProcess = proc;
      let stderr = '';

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        mainWindow?.webContents.send('tiles-download-progress', text.trim());
      });

      proc.stdout?.on('data', (data: Buffer) => {
        mainWindow?.webContents.send('tiles-download-progress', data.toString().trim());
      });

      proc.on('close', (code) => {
        tilesDownloadProcess = null;
        usbManager.releaseWrite();
        if (code === 0) {
          logger.info('tiles', 'Download complete');
          resolve({ success: true });
        } else {
          logger.error('tiles', `Download failed (code ${code}): ${stderr}`);
          resolve({ success: false, error: stderr || `Exit code ${code}` });
        }
      });

      proc.on('error', (err) => {
        tilesDownloadProcess = null;
        usbManager.releaseWrite();
        logger.error('tiles', `Download spawn error: ${err}`);
        resolve({ success: false, error: String(err) });
      });
    });
  });

  ipcMain.handle('tiles-download-cancel', () => {
    if (tilesDownloadProcess) {
      tilesDownloadProcess.kill('SIGTERM');
      tilesDownloadProcess = null;
      // releaseWrite will be called by the 'close' handler
      logger.info('tiles', 'Download cancelled');
      return { success: true };
    }
    return { success: false, error: 'No download in progress' };
  });

  // --- Capture IPC ---
  ipcMain.handle('capture-start', async () => {
    if (!usbManager.isMounted()) {
      return { success: false, error: 'USB not mounted' };
    }
    try {
      await usbManager.acquireWrite();
    } catch (err) {
      return { success: false, error: `RW remount failed: ${err}` };
    }
    const captureDir = path.join(USB_MOUNT_POINT, 'capture');
    try {
      if (!fs.existsSync(captureDir)) {
        fs.mkdirSync(captureDir, { recursive: true });
      }
    } catch (e) {
      await usbManager.releaseWrite();
      return { success: false, error: `Failed to create capture dir: ${e}` };
    }
    const now = new Date();
    const stamp = now.toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
    const filePath = path.join(captureDir, `${stamp}.jsonl`);
    captureManager.start(filePath);
    return { success: true, filePath };
  });

  ipcMain.handle('capture-stop', async () => {
    captureManager.stop();
    await usbManager.releaseWrite();
    return { success: true };
  });

  ipcMain.handle('capture-status', () => {
    return captureManager.getStatus();
  });
}

function findPmtilesCli(): string | null {
  // Check PATH
  try {
    execSync('which pmtiles', { stdio: 'pipe' });
    return 'pmtiles';
  } catch { /* not in PATH */ }
  // Check scripts/pmtiles relative to app
  const scriptPath = path.join(__dirname, '..', 'scripts', 'pmtiles');
  if (fs.existsSync(scriptPath)) return scriptPath;
  return null;
}

app.whenReady().then(() => {
  // Register local-tiles protocol handler (serves local files with Range request support for PMTiles)
  // Resolve asset paths: local-tiles://assets/fonts/... → dist/fonts/...
  const distDir = path.join(__dirname, '../dist');

  protocol.handle('local-tiles', (request) => {
    try {
      const url = new URL(request.url);
      const host = url.host; // 'assets' for bundled assets, empty for PMTiles
      let filePath: string;
      if (host === 'assets') {
        // Serve bundled assets from dist directory
        const assetPath = decodeURIComponent(url.pathname);
        filePath = path.join(distDir, assetPath);
        logger.info('local-tiles', `asset request: ${request.url} → ${filePath} (exists: ${fs.existsSync(filePath)})`);
        // Security: prevent path traversal
        if (!filePath.startsWith(distDir)) return new Response(null, { status: 403 });
      } else {
        filePath = decodeURIComponent(url.pathname);
      }
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.pbf': 'application/x-protobuf',
        '.json': 'application/json',
        '.png': 'image/png',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (!match) return new Response(null, { status: 416 });
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : stat.size - 1;
        if (start >= stat.size) return new Response(null, { status: 416 });
        const clampedEnd = Math.min(end, stat.size - 1);
        const length = clampedEnd - start + 1;
        const buffer = Buffer.alloc(length);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, length, start);
        fs.closeSync(fd);
        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${clampedEnd}/${stat.size}`,
            'Content-Length': String(length),
            'Accept-Ranges': 'bytes',
          },
        });
      }
      // HEAD-like: return headers only for large files (PMTiles always uses Range)
      if (stat.size > 64 * 1024 * 1024) {
        return new Response(null, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(stat.size),
            'Accept-Ranges': 'bytes',
          },
        });
      }
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (err) {
      logger.error('local-tiles', `Error serving ${request.url}: ${err}`);
      return new Response(null, { status: 404 });
    }
  });

  // Check environment variable for mode
  if (process.env.OBD2_MODE === 'real') {
    isStubMode = false;
  }
  logger.info('app', `Starting (mode=${isStubMode ? 'stub' : 'real'}, packaged=${app.isPackaged})`);
  usbManager.autoDetectAndMount();
  logger.info('app', `USB state=${usbManager.getState()}`);
  registerIpcHandlers();
  // Forward GPIO changes to renderer
  gpioManager.onChange((event) => {
    mainWindow?.webContents.send('gpio-change', event);
  });
  // Forward USB state changes to renderer
  usbManager.onChange((state) => {
    mainWindow?.webContents.send('usb-state-change', state);
  });
  createWindow();
});

function cleanupAndQuit(): void {
  if (dataSource) {
    dataSource.dispose();
    dataSource = null;
  }
  if (gpsSource) {
    gpsSource.dispose();
    gpsSource = null;
  }
  if (tpmsSource) {
    tpmsSource.dispose();
    tpmsSource = null;
  }
  if (terminalManager) {
    terminalManager.dispose();
    terminalManager = null;
  }
  captureManager.dispose();
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
