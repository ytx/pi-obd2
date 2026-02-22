export type Screen = 'dashboard' | 'settings';

export interface SystemStats {
  cpuUsage: number;
  cpuTemp: number;
  memTotal: number;
  memFree: number;
  uptime: number;
}
