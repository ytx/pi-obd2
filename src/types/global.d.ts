import { SystemStats } from './index';

declare global {
  const __GIT_COMMIT__: string;

  interface Window {
    obd2API: {
      getHostname: () => Promise<string>;
      getSystemStats: () => Promise<SystemStats>;
      systemShutdown: () => Promise<void>;
      systemReboot: () => Promise<void>;
      saveConfig: () => Promise<boolean>;
    };
  }
}

export {};
