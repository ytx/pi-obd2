import { GpsSource } from './gps-source';
import { OBDValue, OBDConnectionState } from '../obd/types';
import { GPS_PIDS } from './gps-pids';

export type GpsStubProfileName = 'stationary' | 'driving' | 'highway';

interface GpsStubPidConfig {
  pattern: 'fixed' | 'sine' | 'random-walk';
  base?: number;
  amplitude?: number;
  period?: number;
  step?: number;
  min?: number;
  max?: number;
  value?: number;
}

const GPS_STUB_PROFILES: Record<GpsStubProfileName, Record<string, GpsStubPidConfig>> = {
  stationary: {
    GPS_LAT: { pattern: 'fixed', value: 35.6812 },
    GPS_LON: { pattern: 'fixed', value: 139.7671 },
    GPS_SPD: { pattern: 'fixed', value: 0 },
    GPS_ALT: { pattern: 'fixed', value: 40 },
    GPS_HDG: { pattern: 'sine', base: 45, amplitude: 30, period: 20000 },
    GPS_SAT: { pattern: 'fixed', value: 8 },
    GPS_UTC: { pattern: 'fixed', value: 1200 },
  },
  driving: {
    GPS_LAT: { pattern: 'random-walk', base: 35.6812, step: 0.0001, min: 35.67, max: 35.69 },
    GPS_LON: { pattern: 'random-walk', base: 139.7671, step: 0.0001, min: 139.76, max: 139.78 },
    GPS_SPD: { pattern: 'random-walk', base: 40, step: 5, min: 0, max: 60 },
    GPS_ALT: { pattern: 'random-walk', base: 40, step: 1, min: 20, max: 80 },
    GPS_HDG: { pattern: 'sine', base: 90, amplitude: 40, period: 25000 },
    GPS_SAT: { pattern: 'random-walk', base: 10, step: 1, min: 5, max: 14 },
    GPS_UTC: { pattern: 'fixed', value: 1200 },
  },
  highway: {
    GPS_LAT: { pattern: 'random-walk', base: 35.6812, step: 0.0005, min: 35.65, max: 35.72 },
    GPS_LON: { pattern: 'random-walk', base: 139.7671, step: 0.0005, min: 139.74, max: 139.80 },
    GPS_SPD: { pattern: 'sine', base: 100, amplitude: 10, period: 10000 },
    GPS_ALT: { pattern: 'random-walk', base: 50, step: 2, min: 10, max: 200 },
    GPS_HDG: { pattern: 'sine', base: 90, amplitude: 45, period: 15000 },
    GPS_SAT: { pattern: 'fixed', value: 12 },
    GPS_UTC: { pattern: 'fixed', value: 1200 },
  },
};

export class StubGpsSource implements GpsSource {
  private state: OBDConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | null = null;
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private profileName: GpsStubProfileName = 'stationary';
  private pidConfigs: Record<string, GpsStubPidConfig>;
  private walkValues: Record<string, number> = {};
  private startTime = 0;

  constructor() {
    this.pidConfigs = { ...GPS_STUB_PROFILES.stationary };
  }

  async connect(_devicePath?: string): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');
    this.startTime = Date.now();
    this.walkValues = {};
    for (const [pid, cfg] of Object.entries(this.pidConfigs)) {
      if (cfg.pattern === 'random-walk') {
        this.walkValues[pid] = cfg.base ?? 0;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    this.setState('connected');
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.setState('disconnected');
  }

  getState(): OBDConnectionState {
    return this.state;
  }

  onData(callback: (values: OBDValue[]) => void): void {
    this.dataCallbacks.push(callback);
  }

  onConnectionChange(callback: (state: OBDConnectionState) => void): void {
    this.connectionCallbacks.push(callback);
  }

  dispose(): void {
    this.stopPolling();
    this.dataCallbacks = [];
    this.connectionCallbacks = [];
  }

  // --- Stub-specific ---

  getProfileNames(): GpsStubProfileName[] {
    return Object.keys(GPS_STUB_PROFILES) as GpsStubProfileName[];
  }

  setProfile(name: GpsStubProfileName): void {
    const profile = GPS_STUB_PROFILES[name];
    if (!profile) return;
    this.profileName = name;
    this.pidConfigs = { ...profile };
    this.walkValues = {};
    for (const [pid, cfg] of Object.entries(this.pidConfigs)) {
      if (cfg.pattern === 'random-walk') {
        this.walkValues[pid] = cfg.base ?? 0;
      }
    }
  }

  getProfileName(): GpsStubProfileName {
    return this.profileName;
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  private startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => this.poll(), 200);
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    if (this.state !== 'connected') return;
    const now = Date.now();
    const elapsed = now - this.startTime;
    const values: OBDValue[] = [];

    for (const pid of Object.keys(this.pidConfigs)) {
      const cfg = this.pidConfigs[pid];
      if (!cfg) continue;
      const pidDef = GPS_PIDS[pid];
      if (!pidDef) continue;

      let value = this.generateValue(pid, cfg, elapsed);
      value = Math.max(pidDef.min, Math.min(pidDef.max, value));
      values.push({ pid, value, timestamp: now });
    }

    if (values.length > 0) {
      for (const cb of this.dataCallbacks) cb(values);
    }
  }

  private generateValue(pid: string, cfg: GpsStubPidConfig, elapsed: number): number {
    switch (cfg.pattern) {
      case 'fixed':
        return cfg.value ?? cfg.base ?? 0;
      case 'sine': {
        const base = cfg.base ?? 0;
        const amp = cfg.amplitude ?? 10;
        const period = cfg.period ?? 5000;
        return base + amp * Math.sin((2 * Math.PI * elapsed) / period);
      }
      case 'random-walk': {
        const step = cfg.step ?? 1;
        const min = cfg.min ?? 0;
        const max = cfg.max ?? 100;
        let current = this.walkValues[pid] ?? cfg.base ?? 0;
        current += (Math.random() - 0.5) * 2 * step;
        current = Math.max(min, Math.min(max, current));
        this.walkValues[pid] = current;
        return current;
      }
      default:
        return 0;
    }
  }
}
