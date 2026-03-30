import { SystemStats, OBDPidInfo, OBDValue, ThemeInfo, ThemeData, BTDevice, WiFiNetwork, UsbState, GpioChangeEvent, SerialDevice } from './index';

declare global {
  const __GIT_COMMIT__: string;

  interface Window {
    obd2API: {
      // System
      getHostname: () => Promise<string>;
      getSystemStats: () => Promise<SystemStats>;
      systemShutdown: () => Promise<void>;
      systemReboot: () => Promise<void>;
      saveConfig: () => Promise<{ success: boolean; error?: string }>;

      // OBD2 connection
      obdConnect: (devicePath?: string) => Promise<void>;
      obdConnectStub: () => Promise<void>;
      obdDisconnect: () => Promise<void>;
      obdGetState: () => Promise<string>;
      obdGetAvailablePids: () => Promise<OBDPidInfo[]>;
      obdSetPollingPids: (pids: string[]) => Promise<void>;
      obdIsStubMode: () => Promise<boolean>;

      // OBD2 events
      onOBDData: (callback: (values: OBDValue[]) => void) => () => void;
      onOBDConnectionChange: (callback: (state: string) => void) => () => void;

      // DTC
      dtcRead: () => Promise<Array<{ code: string; description: string }>>;
      dtcClear: () => Promise<void>;

      // Stub control
      stubGetProfiles: () => Promise<string[]>;
      stubSetProfile: (name: string) => Promise<void>;
      stubSetPidConfig: (pid: string, config: Record<string, unknown>) => Promise<void>;
      stubGetConfig: () => Promise<Record<string, unknown> | null>;

      // USB
      usbGetState: () => Promise<{ state: UsbState; device: string | null }>;
      onUsbStateChange: (callback: (state: UsbState) => void) => () => void;

      // Config (USB) — 3-file split: config / settings / status
      configLoad: () => Promise<Record<string, unknown> | null>;
      settingsLoad: () => Promise<Record<string, unknown> | null>;
      statusLoad: () => Promise<Record<string, unknown> | null>;
      configSave: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      settingsStatusSave: (settings: Record<string, unknown>, status: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;

      // Themes
      themeList: () => Promise<ThemeInfo[]>;
      themeLoad: (themeId: string) => Promise<ThemeData | null>;

      // Theme Editor
      themeGetDirs: () => Promise<Array<{ path: string; label: string }>>;
      themeCreate: (name: string, targetDir?: string) => Promise<{ success: boolean; error?: string }>;
      themeDuplicate: (sourceId: string, newName: string) => Promise<{ success: boolean; error?: string }>;
      themeDelete: (themeId: string) => Promise<{ success: boolean; error?: string }>;
      themeRename: (themeId: string, newName: string) => Promise<{ success: boolean; error?: string }>;
      themeSaveProperties: (themeId: string, properties: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
      themeReadFile: (filePath: string, mimeType: string) => Promise<string | null>;
      themeWriteAsset: (themeId: string, assetName: string, base64Data: string) => Promise<{ success: boolean; error?: string }>;
      themePickFile: (filters: Array<{ name: string; extensions: string[] }>) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
      themeCopyAsset: (themeId: string, sourcePath: string, assetName: string) => Promise<{ success: boolean; error?: string }>;
      themeDeleteAsset: (themeId: string, assetName: string) => Promise<{ success: boolean; error?: string }>;

      // Bluetooth
      btScan: () => Promise<BTDevice[]>;
      btPair: (address: string) => Promise<{ success: boolean; error?: string }>;
      btConnect: (address: string) => Promise<{ success: boolean; error?: string }>;
      btDisconnect: (address: string) => Promise<{ success: boolean; error?: string }>;
      btGetDevices: () => Promise<BTDevice[]>;
      btRfcommBind: (address: string) => Promise<{ success: boolean; devicePath?: string; error?: string }>;

      // Serial devices
      serialScan: () => Promise<SerialDevice[]>;

      // WiFi
      wifiScan: () => Promise<WiFiNetwork[]>;
      wifiConnect: (ssid: string, password: string) => Promise<boolean>;
      wifiDisconnect: () => Promise<boolean>;
      wifiGetCurrent: () => Promise<string | null>;

      // GPIO
      gpioSetup: (pins: number[]) => Promise<void>;
      gpioRead: (pin: number) => Promise<number>;
      gpioSet: (pin: number, value: number) => Promise<void>;
      gpioUsbReset: (pin: number) => Promise<void>;
      gpioSetUsbResetPin: (pin: number | null) => Promise<void>;
      onGpioChange: (callback: (event: GpioChangeEvent) => void) => () => void;

      // GPS
      gpsConnect: (devicePath?: string) => Promise<void>;
      gpsConnectStub: () => Promise<void>;
      gpsDisconnect: () => Promise<void>;
      gpsGetState: () => Promise<string>;
      gpsIsStubMode: () => Promise<boolean>;
      onGPSData: (callback: (values: OBDValue[]) => void) => () => void;
      onGPSConnectionChange: (callback: (state: string) => void) => () => void;

      // TPMS
      tpmsConnect: () => Promise<void>;
      tpmsConnectStub: () => Promise<void>;
      tpmsDisconnect: () => Promise<void>;
      tpmsGetState: () => Promise<string>;
      tpmsIsStubMode: () => Promise<boolean>;
      tpmsGetSensors: () => Promise<Array<{ id: string; pressure: number; temperature: number; battery: number; rssi: number; lastSeen: number }>>;
      tpmsAssignSensor: (sensorId: string, position: string) => Promise<void>;
      tpmsUnassignSensor: (position: string) => Promise<void>;
      tpmsGetAssignments: () => Promise<Record<string, string | null>>;
      onTPMSData: (callback: (values: OBDValue[]) => void) => () => void;
      onTPMSConnectionChange: (callback: (state: string) => void) => () => void;
      onTPMSSensorDiscovered: (callback: (sensor: { id: string; pressure: number; temperature: number; battery: number; rssi: number; lastSeen: number }) => void) => () => void;

      // Terminal
      terminalSpawn: (cols: number, rows: number) => Promise<void>;
      terminalWrite: (data: string) => Promise<void>;
      terminalResize: (cols: number, rows: number) => Promise<void>;
      terminalKill: () => Promise<void>;
      onTerminalOutput: (callback: (data: string) => void) => () => void;
      onTerminalExit: (callback: (code: number) => void) => () => void;

      // Map
      mapListTiles: () => Promise<Array<{ path: string; name: string; size: number }>>;
      tilesDownload: (bbox: [number, number, number, number], maxzoom: number) => Promise<{ success: boolean; error?: string }>;
      tilesDownloadCancel: () => Promise<{ success: boolean; error?: string }>;
      onTilesDownloadProgress: (callback: (message: string) => void) => () => void;

      // Capture
      captureStart: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
      captureStop: () => Promise<{ success: boolean }>;
      captureStatus: () => Promise<{ capturing: boolean; filePath: string | null; count: number }>;

      // Logs
      getLogs: () => Promise<Array<{ timestamp: string; level: string; tag: string; message: string }>>;
      saveLogsUsb: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
      logSettings: (settings: Record<string, unknown>) => Promise<void>;
    };
  }
}

export {};
