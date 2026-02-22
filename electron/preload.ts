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
};

contextBridge.exposeInMainWorld('obd2API', obd2API);

declare global {
  interface Window {
    obd2API: typeof obd2API;
  }
}
