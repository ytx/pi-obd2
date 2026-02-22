export interface OBDPid {
  id: string;        // e.g. '010C'
  name: string;
  unit: string;
  min: number;
  max: number;
  bytes: number;
  formula: (bytes: number[]) => number;
}

export interface OBDValue {
  pid: string;
  value: number;
  timestamp: number;
}

export type OBDConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type SimulationPattern = 'sine' | 'random-walk' | 'fixed' | 'ramp';

export interface StubPidConfig {
  pattern: SimulationPattern;
  base?: number;
  amplitude?: number;
  period?: number;     // ms (for sine/ramp)
  value?: number;      // for fixed
  step?: number;       // for random-walk
  min?: number;
  max?: number;
}

export type StubProfileName = 'idle' | 'city' | 'highway';

export interface StubConfig {
  profileName: StubProfileName;
  interval: number;  // polling interval ms
  pidConfigs: Record<string, StubPidConfig>;
}

export interface OBDPidInfo {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
}
