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
  saveConfig: (): Promise<boolean> => ipcRenderer.invoke('save-config'),

  // OBD2 connection
  obdConnect: (): Promise<void> => ipcRenderer.invoke('obd-connect'),
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

  // Themes
  themeList: (): Promise<Array<{ id: string; apkFile: string; themeZip: string; name: string; screenshotBase64?: string }>> =>
    ipcRenderer.invoke('theme-list'),
  themeLoad: (themeId: string): Promise<unknown> => ipcRenderer.invoke('theme-load', themeId),

  // Bluetooth
  btScan: (): Promise<Array<{ address: string; name: string; paired: boolean; connected: boolean; rssi?: number }>> =>
    ipcRenderer.invoke('bt-scan'),
  btPair: (address: string): Promise<boolean> => ipcRenderer.invoke('bt-pair', address),
  btConnect: (address: string): Promise<boolean> => ipcRenderer.invoke('bt-connect', address),
  btDisconnect: (address: string): Promise<boolean> => ipcRenderer.invoke('bt-disconnect', address),
  btGetDevices: (): Promise<Array<{ address: string; name: string; paired: boolean; connected: boolean; rssi?: number }>> =>
    ipcRenderer.invoke('bt-get-devices'),

  // WiFi
  wifiScan: (): Promise<Array<{ ssid: string; signal: number; security: string; connected: boolean }>> =>
    ipcRenderer.invoke('wifi-scan'),
  wifiConnect: (ssid: string, password: string): Promise<boolean> =>
    ipcRenderer.invoke('wifi-connect', ssid, password),
  wifiDisconnect: (): Promise<boolean> => ipcRenderer.invoke('wifi-disconnect'),
  wifiGetCurrent: (): Promise<string | null> => ipcRenderer.invoke('wifi-get-current'),
};

contextBridge.exposeInMainWorld('obd2API', obd2API);

declare global {
  interface Window {
    obd2API: typeof obd2API;
  }
}
