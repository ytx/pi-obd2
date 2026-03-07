import { GpsSource } from './gps-source';
import { OBDValue, OBDConnectionState } from '../obd/types';
import { GPS_PIDS } from './gps-pids';

export type GpsStubProfileName = 'stationary' | 'driving' | 'highway';

interface GpsStubPidConfig {
  pattern: 'fixed' | 'sine' | 'random-walk' | 'derive-from-heading';
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
    GPS_LAT: { pattern: 'derive-from-heading' },
    GPS_LON: { pattern: 'derive-from-heading' },
    GPS_SPD: { pattern: 'sine', base: 40, amplitude: 15, period: 12000 },
    GPS_ALT: { pattern: 'random-walk', base: 40, step: 1, min: 20, max: 80 },
    GPS_HDG: { pattern: 'sine', base: 90, amplitude: 40, period: 25000 },
    GPS_SAT: { pattern: 'random-walk', base: 10, step: 1, min: 5, max: 14 },
    GPS_UTC: { pattern: 'fixed', value: 1200 },
  },
  highway: {
    GPS_LAT: { pattern: 'derive-from-heading' },
    GPS_LON: { pattern: 'derive-from-heading' },
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
      } else if (cfg.pattern === 'derive-from-heading') {
        if (pid === 'GPS_LAT') this.walkValues[pid] = 35.6812;
        if (pid === 'GPS_LON') this.walkValues[pid] = 139.7671;
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
      } else if (cfg.pattern === 'derive-from-heading') {
        // Initialize position from stationary profile base
        if (pid === 'GPS_LAT') this.walkValues[pid] = 35.6812;
        if (pid === 'GPS_LON') this.walkValues[pid] = 139.7671;
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

    // Generate heading and speed first (needed for derive-from-heading)
    let hdg = 0;
    let spd = 0;
    for (const pid of ['GPS_HDG', 'GPS_SPD']) {
      const cfg = this.pidConfigs[pid];
      if (!cfg || cfg.pattern === 'derive-from-heading') continue;
      const pidDef = GPS_PIDS[pid];
      if (!pidDef) continue;
      let value = this.generateValue(pid, cfg, elapsed);
      value = Math.max(pidDef.min, Math.min(pidDef.max, value));
      if (pid === 'GPS_HDG') hdg = value;
      if (pid === 'GPS_SPD') spd = value;
      values.push({ pid, value, timestamp: now });
    }

    // Derive lat/lon from heading + speed
    const latCfg = this.pidConfigs['GPS_LAT'];
    if (latCfg?.pattern === 'derive-from-heading') {
      const dtSec = 0.2; // poll interval
      const distM = (spd / 3.6) * dtSec; // km/h → m/s → meters per tick
      const hdgRad = (hdg * Math.PI) / 180;
      const dLat = (distM * Math.cos(hdgRad)) / 111320;
      const currentLat = this.walkValues['GPS_LAT'] ?? 35.6812;
      const currentLon = this.walkValues['GPS_LON'] ?? 139.7671;
      const dLon = (distM * Math.sin(hdgRad)) / (111320 * Math.cos((currentLat * Math.PI) / 180));
      this.walkValues['GPS_LAT'] = currentLat + dLat;
      this.walkValues['GPS_LON'] = currentLon + dLon;
      values.push({ pid: 'GPS_LAT', value: this.walkValues['GPS_LAT'], timestamp: now });
      values.push({ pid: 'GPS_LON', value: this.walkValues['GPS_LON'], timestamp: now });
    }

    // Generate remaining PIDs
    const derivePids = latCfg?.pattern === 'derive-from-heading' ? ['GPS_HDG', 'GPS_SPD', 'GPS_LAT', 'GPS_LON'] : ['GPS_HDG', 'GPS_SPD'];
    for (const pid of Object.keys(this.pidConfigs)) {
      if (derivePids.includes(pid)) continue;
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
