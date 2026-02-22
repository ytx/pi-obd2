import { SystemStats, OBDPidInfo, OBDValue, ThemeInfo, ThemeData } from './index';

declare global {
  const __GIT_COMMIT__: string;

  interface Window {
    obd2API: {
      // System
      getHostname: () => Promise<string>;
      getSystemStats: () => Promise<SystemStats>;
      systemShutdown: () => Promise<void>;
      systemReboot: () => Promise<void>;
      saveConfig: () => Promise<boolean>;

      // OBD2 connection
      obdConnect: () => Promise<void>;
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

      // Themes
      themeList: () => Promise<ThemeInfo[]>;
      themeLoad: (themeId: string) => Promise<ThemeData | null>;
    };
  }
}

export {};
