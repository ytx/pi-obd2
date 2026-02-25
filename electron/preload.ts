import { contextBridge, ipcRenderer } from 'electron';

export interface SystemStats {
  cpuUsage: number;
  cpuTemp: number;
  memTotal: number;
  memFree: number;
  uptime: number;
}

const obd2API = {
  // System
  getHostname: (): Promise<string> => ipcRenderer.invoke('get-hostname'),
  getSystemStats: (): Promise<SystemStats> => ipcRenderer.invoke('get-system-stats'),
  systemShutdown: (): Promise<void> => ipcRenderer.invoke('system-shutdown'),
  systemReboot: (): Promise<void> => ipcRenderer.invoke('system-reboot'),
  saveConfig: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('save-config'),

  // OBD2 connection
  obdConnect: (btAddress?: string): Promise<void> => ipcRenderer.invoke('obd-connect', btAddress),
  obdConnectStub: (): Promise<void> => ipcRenderer.invoke('obd-connect-stub'),
  obdDisconnect: (): Promise<void> => ipcRenderer.invoke('obd-disconnect'),
  obdGetState: (): Promise<string> => ipcRenderer.invoke('obd-get-state'),
  obdGetAvailablePids: (): Promise<Array<{ id: string; name: string; unit: string; min: number; max: number }>> =>
    ipcRenderer.invoke('obd-get-available-pids'),
  obdSetPollingPids: (pids: string[]): Promise<void> => ipcRenderer.invoke('obd-set-polling-pids', pids),
  obdIsStubMode: (): Promise<boolean> => ipcRenderer.invoke('obd-is-stub-mode'),

  // OBD2 events (main → renderer)
  onOBDData: (callback: (values: Array<{ pid: string; value: number; timestamp: number }>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, values: Array<{ pid: string; value: number; timestamp: number }>) => callback(values);
    ipcRenderer.on('obd-data', listener);
    return () => { ipcRenderer.removeListener('obd-data', listener); };
  },
  onOBDConnectionChange: (callback: (state: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) => callback(state);
    ipcRenderer.on('obd-connection-change', listener);
    return () => { ipcRenderer.removeListener('obd-connection-change', listener); };
  },

  // Stub control
  stubGetProfiles: (): Promise<string[]> => ipcRenderer.invoke('stub-get-profiles'),
  stubSetProfile: (name: string): Promise<void> => ipcRenderer.invoke('stub-set-profile', name),
  stubSetPidConfig: (pid: string, config: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('stub-set-pid-config', pid, config),
  stubGetConfig: (): Promise<Record<string, unknown> | null> => ipcRenderer.invoke('stub-get-config'),

  // USB
  detectUsb: (): Promise<Array<{ device: string; size: string; mountpoint: string | null }>> =>
    ipcRenderer.invoke('detect-usb'),
  mountUsb: (device: string): Promise<{ success: boolean; mountpoint?: string; error?: string }> =>
    ipcRenderer.invoke('mount-usb', device),
  unmountUsb: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('unmount-usb'),
  usbExportConfig: (configJson: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('usb-export-config', configJson),
  usbImportConfig: (): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('usb-import-config'),

  // Themes
  themeList: (): Promise<Array<{ id: string; name: string; screenshotBase64?: string }>> =>
    ipcRenderer.invoke('theme-list'),
  themeLoad: (themeId: string): Promise<unknown> => ipcRenderer.invoke('theme-load', themeId),

  // Bluetooth
  btScan: (): Promise<Array<{ address: string; name: string; paired: boolean; connected: boolean; rssi?: number }>> =>
    ipcRenderer.invoke('bt-scan'),
  btPair: (address: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('bt-pair', address),
  btConnect: (address: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('bt-connect', address),
  btDisconnect: (address: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('bt-disconnect', address),
  btGetDevices: (): Promise<Array<{ address: string; name: string; paired: boolean; connected: boolean; rssi?: number }>> =>
    ipcRenderer.invoke('bt-get-devices'),

  // WiFi
  wifiScan: (): Promise<Array<{ ssid: string; signal: number; security: string; connected: boolean }>> =>
    ipcRenderer.invoke('wifi-scan'),
  wifiConnect: (ssid: string, password: string): Promise<boolean> =>
    ipcRenderer.invoke('wifi-connect', ssid, password),
  wifiDisconnect: (): Promise<boolean> => ipcRenderer.invoke('wifi-disconnect'),
  wifiGetCurrent: (): Promise<string | null> => ipcRenderer.invoke('wifi-get-current'),

  // GPIO
  gpioSetup: (pins: number[]): Promise<void> => ipcRenderer.invoke('gpio-setup', pins),
  gpioRead: (pin: number): Promise<number> => ipcRenderer.invoke('gpio-read', pin),
  onGpioChange: (callback: (event: { pin: number; value: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { pin: number; value: number }) => callback(data);
    ipcRenderer.on('gpio-change', listener);
    return () => { ipcRenderer.removeListener('gpio-change', listener); };
  },

  // Logs
  getLogs: (): Promise<Array<{ timestamp: string; level: string; tag: string; message: string }>> =>
    ipcRenderer.invoke('get-logs'),
  saveLogsUsb: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('save-logs-usb'),
  logSettings: (settings: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('log-settings', settings),
  isUsbMounted: (): Promise<boolean> => ipcRenderer.invoke('is-usb-mounted'),
};

contextBridge.exposeInMainWorld('obd2API', obd2API);

declare global {
  interface Window {
    obd2API: typeof obd2API;
  }
}
