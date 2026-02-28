import { SystemStats, OBDPidInfo, OBDValue, ThemeInfo, ThemeData, BTDevice, WiFiNetwork, UsbDevice, UsbResult, GpioChangeEvent, SerialDevice } from './index';

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

      // Stub control
      stubGetProfiles: () => Promise<string[]>;
      stubSetProfile: (name: string) => Promise<void>;
      stubSetPidConfig: (pid: string, config: Record<string, unknown>) => Promise<void>;
      stubGetConfig: () => Promise<Record<string, unknown> | null>;

      // USB
      detectUsb: () => Promise<UsbDevice[]>;
      mountUsb: (device: string) => Promise<UsbResult>;
      unmountUsb: () => Promise<UsbResult>;
      usbExportConfig: (configJson: string) => Promise<UsbResult>;
      usbImportConfig: () => Promise<{ success: boolean; data?: string; error?: string }>;

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
      onGpioChange: (callback: (event: GpioChangeEvent) => void) => () => void;

      // Logs
      getLogs: () => Promise<Array<{ timestamp: string; level: string; tag: string; message: string }>>;
      saveLogsUsb: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
      logSettings: (settings: Record<string, unknown>) => Promise<void>;
      isUsbMounted: () => Promise<boolean>;
    };
  }
}

export {};
