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
  obdConnect: (devicePath?: string): Promise<void> => ipcRenderer.invoke('obd-connect', devicePath),
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

  // DTC
  dtcRead: (): Promise<Array<{ code: string; description: string }>> =>
    ipcRenderer.invoke('dtc-read'),
  dtcClear: (): Promise<void> => ipcRenderer.invoke('dtc-clear'),

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

  // Theme Editor
  themeGetDirs: (): Promise<Array<{ path: string; label: string }>> =>
    ipcRenderer.invoke('theme-get-dirs'),
  themeCreate: (name: string, targetDir?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-create', name, targetDir),
  themeDuplicate: (sourceId: string, newName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-duplicate', sourceId, newName),
  themeDelete: (themeId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-delete', themeId),
  themeRename: (themeId: string, newName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-rename', themeId, newName),
  themeSaveProperties: (themeId: string, properties: Record<string, string>): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-save-properties', themeId, properties),
  themeReadFile: (filePath: string, mimeType: string): Promise<string | null> =>
    ipcRenderer.invoke('theme-read-file', filePath, mimeType),
  themeWriteAsset: (themeId: string, assetName: string, base64Data: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-write-asset', themeId, assetName, base64Data),
  themePickFile: (filters: Array<{ name: string; extensions: string[] }>): Promise<{ success: boolean; filePath?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('theme-pick-file', filters),
  themeCopyAsset: (themeId: string, sourcePath: string, assetName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-copy-asset', themeId, sourcePath, assetName),
  themeDeleteAsset: (themeId: string, assetName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('theme-delete-asset', themeId, assetName),

  // Bluetooth
  btScan: (): Promise<Array<{ address: string; name: string; paired: boolean; connected: boolean; rssi?: number }>> =>
    ipcRenderer.invoke('bt-scan'),
  btPair: (address: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('bt-pair', address),
  btConnect: (address: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('bt-connect', address),
  btDisconnect: (address: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('bt-disconnect', address),
  btGetDevices: (): Promise<Array<{ address: string; name: string; paired: boolean; connected: boolean; rssi?: number }>> =>
    ipcRenderer.invoke('bt-get-devices'),
  btRfcommBind: (address: string): Promise<{ success: boolean; devicePath?: string; error?: string }> =>
    ipcRenderer.invoke('bt-rfcomm-bind', address),

  // Serial devices
  serialScan: (): Promise<Array<{ path: string; type: string }>> =>
    ipcRenderer.invoke('serial-scan'),

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
  gpioSet: (pin: number, value: number): Promise<void> => ipcRenderer.invoke('gpio-set', pin, value),
  gpioUsbReset: (pin: number): Promise<void> => ipcRenderer.invoke('gpio-usb-reset', pin),
  gpioSetUsbResetPin: (pin: number | null): Promise<void> => ipcRenderer.invoke('gpio-set-usb-reset-pin', pin),
  onGpioChange: (callback: (event: { pin: number; value: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { pin: number; value: number }) => callback(data);
    ipcRenderer.on('gpio-change', listener);
    return () => { ipcRenderer.removeListener('gpio-change', listener); };
  },

  // GPS
  gpsConnect: (devicePath?: string): Promise<void> => ipcRenderer.invoke('gps-connect', devicePath),
  gpsConnectStub: (): Promise<void> => ipcRenderer.invoke('gps-connect-stub'),
  gpsDisconnect: (): Promise<void> => ipcRenderer.invoke('gps-disconnect'),
  gpsGetState: (): Promise<string> => ipcRenderer.invoke('gps-get-state'),
  gpsIsStubMode: (): Promise<boolean> => ipcRenderer.invoke('gps-is-stub-mode'),
  onGPSData: (callback: (values: Array<{ pid: string; value: number; timestamp: number }>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, values: Array<{ pid: string; value: number; timestamp: number }>) => callback(values);
    ipcRenderer.on('gps-data', listener);
    return () => { ipcRenderer.removeListener('gps-data', listener); };
  },
  onGPSConnectionChange: (callback: (state: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) => callback(state);
    ipcRenderer.on('gps-connection-change', listener);
    return () => { ipcRenderer.removeListener('gps-connection-change', listener); };
  },

  // Terminal
  terminalSpawn: (cols: number, rows: number): Promise<void> => ipcRenderer.invoke('terminal-spawn', cols, rows),
  terminalWrite: (data: string): Promise<void> => ipcRenderer.invoke('terminal-write', data),
  terminalResize: (cols: number, rows: number): Promise<void> => ipcRenderer.invoke('terminal-resize', cols, rows),
  terminalKill: (): Promise<void> => ipcRenderer.invoke('terminal-kill'),
  onTerminalOutput: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('terminal-output', listener);
    return () => { ipcRenderer.removeListener('terminal-output', listener); };
  },
  onTerminalExit: (callback: (code: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, code: number) => callback(code);
    ipcRenderer.on('terminal-exit', listener);
    return () => { ipcRenderer.removeListener('terminal-exit', listener); };
  },

  // Map
  mapListTiles: (): Promise<Array<{ path: string; name: string; size: number }>> =>
    ipcRenderer.invoke('map-list-tiles'),
  tilesGetStatus: (): Promise<{ mounted: boolean; device: string | null; mountpoint: string | null }> =>
    ipcRenderer.invoke('tiles-get-status'),
  tilesAutoMount: (): Promise<{ success: boolean; device?: string; error?: string }> =>
    ipcRenderer.invoke('tiles-auto-mount'),
  tilesDownload: (bbox: [number, number, number, number], maxzoom: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tiles-download', bbox, maxzoom),
  tilesDownloadCancel: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('tiles-download-cancel'),
  onTilesDownloadProgress: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('tiles-download-progress', listener);
    return () => { ipcRenderer.removeListener('tiles-download-progress', listener); };
  },

  // Capture
  captureStart: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('capture-start'),
  captureStop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('capture-stop'),
  captureStatus: (): Promise<{ capturing: boolean; filePath: string | null; count: number }> =>
    ipcRenderer.invoke('capture-status'),

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
