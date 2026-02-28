import { DataSource } from './data-source';
import { OBDValue, OBDConnectionState, StubConfig, StubPidConfig, StubProfileName } from './types';
import { OBD_PIDS } from './pids';

const STUB_PROFILES: Record<StubProfileName, Record<string, StubPidConfig>> = {
  idle: {
    '010C': { pattern: 'sine', base: 750, amplitude: 50, period: 5000 },
    '010D': { pattern: 'fixed', value: 0 },
    '0105': { pattern: 'random-walk', base: 85, step: 0.5, min: 80, max: 95 },
    '0111': { pattern: 'sine', base: 5, amplitude: 3, period: 3000 },
    '010F': { pattern: 'fixed', value: 25 },
    '0104': { pattern: 'sine', base: 20, amplitude: 10, period: 4000 },
    '0133': { pattern: 'fixed', value: 101 },
    '010B': { pattern: 'sine', base: 35, amplitude: 5, period: 4000 },
    '012F': { pattern: 'random-walk', base: 60, step: 0.1, min: 50, max: 70 },
    '0142': { pattern: 'sine', base: 14.2, amplitude: 0.1, period: 6000 },
  },
  city: {
    '010C': { pattern: 'random-walk', base: 2000, step: 200, min: 700, max: 4500 },
    '010D': { pattern: 'random-walk', base: 40, step: 5, min: 0, max: 80 },
    '0105': { pattern: 'random-walk', base: 90, step: 0.3, min: 85, max: 100 },
    '0111': { pattern: 'random-walk', base: 25, step: 5, min: 0, max: 80 },
    '010F': { pattern: 'random-walk', base: 30, step: 1, min: 20, max: 45 },
    '0104': { pattern: 'random-walk', base: 40, step: 8, min: 10, max: 85 },
    '0133': { pattern: 'fixed', value: 101 },
    '010B': { pattern: 'random-walk', base: 50, step: 10, min: 20, max: 120 },
    '012F': { pattern: 'random-walk', base: 55, step: 0.2, min: 40, max: 70 },
    '0142': { pattern: 'sine', base: 14.0, amplitude: 0.3, period: 5000 },
  },
  highway: {
    '010C': { pattern: 'sine', base: 3000, amplitude: 300, period: 8000 },
    '010D': { pattern: 'sine', base: 100, amplitude: 10, period: 10000 },
    '0105': { pattern: 'random-walk', base: 95, step: 0.2, min: 90, max: 105 },
    '0111': { pattern: 'sine', base: 35, amplitude: 8, period: 6000 },
    '010F': { pattern: 'random-walk', base: 35, step: 0.5, min: 25, max: 45 },
    '0104': { pattern: 'sine', base: 45, amplitude: 15, period: 7000 },
    '0133': { pattern: 'fixed', value: 101 },
    '010B': { pattern: 'sine', base: 80, amplitude: 20, period: 6000 },
    '012F': { pattern: 'random-walk', base: 50, step: 0.3, min: 30, max: 65 },
    '0142': { pattern: 'sine', base: 14.4, amplitude: 0.2, period: 8000 },
  },
};

export class StubSource implements DataSource {
  private state: OBDConnectionState = 'disconnected';
  private pollingPids: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private config: StubConfig;
  private walkValues: Record<string, number> = {};
  private startTime = 0;

  constructor() {
    this.config = {
      profileName: 'idle',
      interval: 200,
      pidConfigs: { ...STUB_PROFILES.idle },
    };
  }

  async connect(_devicePath?: string): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');
    this.startTime = Date.now();
    this.walkValues = {};
    // Initialize random-walk values
    for (const [pid, cfg] of Object.entries(this.config.pidConfigs)) {
      if (cfg.pattern === 'random-walk') {
        this.walkValues[pid] = cfg.base ?? 0;
      }
    }
    // Simulate brief connection delay
    await new Promise((r) => setTimeout(r, 300));
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

  requestPids(pids: string[]): void {
    this.pollingPids = pids;
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

  // --- Stub-specific API ---

  getConfig(): StubConfig {
    return { ...this.config, pidConfigs: { ...this.config.pidConfigs } };
  }

  getProfileNames(): StubProfileName[] {
    return Object.keys(STUB_PROFILES) as StubProfileName[];
  }

  setProfile(name: StubProfileName): void {
    const profile = STUB_PROFILES[name];
    if (!profile) return;
    this.config.profileName = name;
    this.config.pidConfigs = { ...profile };
    // Reset walk values for new profile
    this.walkValues = {};
    for (const [pid, cfg] of Object.entries(this.config.pidConfigs)) {
      if (cfg.pattern === 'random-walk') {
        this.walkValues[pid] = cfg.base ?? 0;
      }
    }
  }

  setPidConfig(pid: string, cfg: StubPidConfig): void {
    this.config.pidConfigs[pid] = cfg;
    if (cfg.pattern === 'random-walk') {
      this.walkValues[pid] = cfg.base ?? 0;
    }
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  private startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => this.poll(), this.config.interval);
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

    const pidsToSend = this.pollingPids.length > 0
      ? this.pollingPids
      : Object.keys(this.config.pidConfigs);

    for (const pid of pidsToSend) {
      const cfg = this.config.pidConfigs[pid];
      if (!cfg) continue;
      const pidDef = OBD_PIDS[pid];
      if (!pidDef) continue;

      let value = this.generateValue(pid, cfg, elapsed);
      value = Math.max(pidDef.min, Math.min(pidDef.max, value));

      values.push({ pid, value, timestamp: now });
    }

    if (values.length > 0) {
      for (const cb of this.dataCallbacks) cb(values);
    }
  }

  private generateValue(pid: string, cfg: StubPidConfig, elapsed: number): number {
    switch (cfg.pattern) {
      case 'fixed':
        return cfg.value ?? cfg.base ?? 0;

      case 'sine': {
        const base = cfg.base ?? 0;
        const amp = cfg.amplitude ?? 10;
        const period = cfg.period ?? 5000;
        return base + amp * Math.sin((2 * Math.PI * elapsed) / period);
      }

      case 'ramp': {
        const base = cfg.base ?? 0;
        const amp = cfg.amplitude ?? 10;
        const period = cfg.period ?? 5000;
        const phase = (elapsed % period) / period;
        // Triangle wave: 0→1→0
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        return base + amp * tri;
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
