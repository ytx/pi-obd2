import { TpmsSource, TpmsSensorInfo, TirePosition } from './tpms-source';
import { OBDValue, OBDConnectionState } from '../obd/types';

export type TpmsStubProfileName = 'stationary' | 'driving' | 'highway';

interface TpmsStubTireConfig {
  pressureBase: number;    // kPa
  pressureAmplitude: number;
  temperatureBase: number; // °C
  temperatureAmplitude: number;
  battery: number;         // V
}

const TPMS_STUB_PROFILES: Record<TpmsStubProfileName, Record<TirePosition, TpmsStubTireConfig>> = {
  stationary: {
    FL: { pressureBase: 230, pressureAmplitude: 1, temperatureBase: 25, temperatureAmplitude: 1, battery: 3.1 },
    FR: { pressureBase: 228, pressureAmplitude: 1, temperatureBase: 25, temperatureAmplitude: 1, battery: 3.0 },
    RL: { pressureBase: 232, pressureAmplitude: 1, temperatureBase: 24, temperatureAmplitude: 1, battery: 2.9 },
    RR: { pressureBase: 227, pressureAmplitude: 1, temperatureBase: 24, temperatureAmplitude: 1, battery: 3.2 },
  },
  driving: {
    FL: { pressureBase: 240, pressureAmplitude: 5, temperatureBase: 35, temperatureAmplitude: 5, battery: 3.1 },
    FR: { pressureBase: 238, pressureAmplitude: 5, temperatureBase: 36, temperatureAmplitude: 5, battery: 3.0 },
    RL: { pressureBase: 242, pressureAmplitude: 4, temperatureBase: 33, temperatureAmplitude: 4, battery: 2.9 },
    RR: { pressureBase: 237, pressureAmplitude: 4, temperatureBase: 34, temperatureAmplitude: 4, battery: 3.2 },
  },
  highway: {
    FL: { pressureBase: 250, pressureAmplitude: 8, temperatureBase: 45, temperatureAmplitude: 8, battery: 3.1 },
    FR: { pressureBase: 248, pressureAmplitude: 8, temperatureBase: 46, temperatureAmplitude: 8, battery: 3.0 },
    RL: { pressureBase: 252, pressureAmplitude: 6, temperatureBase: 42, temperatureAmplitude: 6, battery: 2.9 },
    RR: { pressureBase: 247, pressureAmplitude: 6, temperatureBase: 43, temperatureAmplitude: 6, battery: 3.2 },
  },
};

const STUB_SENSOR_IDS: Record<TirePosition, string> = {
  FL: 'stub-tpms-fl',
  FR: 'stub-tpms-fr',
  RL: 'stub-tpms-rl',
  RR: 'stub-tpms-rr',
};

const POSITIONS: TirePosition[] = ['FL', 'FR', 'RL', 'RR'];

export class StubTpmsSource implements TpmsSource {
  private state: OBDConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | null = null;
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private sensorCallbacks: ((sensor: TpmsSensorInfo) => void)[] = [];
  private sensors: Map<string, TpmsSensorInfo> = new Map();
  private assignments: Record<TirePosition, string | null> = { FL: null, FR: null, RL: null, RR: null };
  private profileName: TpmsStubProfileName = 'stationary';
  private startTime = 0;

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');
    this.startTime = Date.now();

    await new Promise((r) => setTimeout(r, 200));
    this.setState('connected');

    // Discover 4 virtual sensors and auto-assign
    for (const pos of POSITIONS) {
      const id = STUB_SENSOR_IDS[pos];
      const cfg = TPMS_STUB_PROFILES[this.profileName][pos];
      const sensor: TpmsSensorInfo = {
        id,
        pressure: cfg.pressureBase,
        temperature: cfg.temperatureBase,
        battery: cfg.battery,
        rssi: -50 - Math.floor(Math.random() * 20),
        lastSeen: Date.now(),
      };
      this.sensors.set(id, sensor);
      for (const cb of this.sensorCallbacks) cb(sensor);
      // Auto-assign if not already assigned
      if (!this.assignments[pos]) {
        this.assignments[pos] = id;
      }
    }

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

  onSensorDiscovered(callback: (sensor: TpmsSensorInfo) => void): void {
    this.sensorCallbacks.push(callback);
  }

  getSensors(): TpmsSensorInfo[] {
    return Array.from(this.sensors.values());
  }

  assignSensor(sensorId: string, position: TirePosition): void {
    // Remove from any existing assignment
    for (const pos of POSITIONS) {
      if (this.assignments[pos] === sensorId) {
        this.assignments[pos] = null;
      }
    }
    this.assignments[position] = sensorId;
  }

  unassignSensor(position: TirePosition): void {
    this.assignments[position] = null;
  }

  getAssignments(): Record<TirePosition, string | null> {
    return { ...this.assignments };
  }

  setAssignments(assignments: Record<TirePosition, string | null>): void {
    this.assignments = { ...assignments };
  }

  dispose(): void {
    this.stopPolling();
    this.dataCallbacks = [];
    this.connectionCallbacks = [];
    this.sensorCallbacks = [];
  }

  // --- Stub-specific ---

  setProfile(name: TpmsStubProfileName): void {
    if (TPMS_STUB_PROFILES[name]) {
      this.profileName = name;
    }
  }

  getProfileName(): TpmsStubProfileName {
    return this.profileName;
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  private startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => this.poll(), 1000); // TPMS sensors typically update ~1Hz
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

    for (const pos of POSITIONS) {
      const sensorId = this.assignments[pos];
      if (!sensorId) continue;

      const cfg = TPMS_STUB_PROFILES[this.profileName][pos];
      const pressure = cfg.pressureBase + cfg.pressureAmplitude * Math.sin((2 * Math.PI * elapsed) / 30000);
      const temperature = cfg.temperatureBase + cfg.temperatureAmplitude * Math.sin((2 * Math.PI * elapsed) / 60000);
      const battery = cfg.battery;

      // Update sensor info
      const sensor = this.sensors.get(sensorId);
      if (sensor) {
        sensor.pressure = Math.round(pressure * 10) / 10;
        sensor.temperature = Math.round(temperature * 10) / 10;
        sensor.battery = battery;
        sensor.lastSeen = now;
        for (const cb of this.sensorCallbacks) cb(sensor);
      }

      values.push(
        { pid: `TPMS_${pos}_P`, value: Math.round(pressure * 10) / 10, timestamp: now },
        { pid: `TPMS_${pos}_T`, value: Math.round(temperature * 10) / 10, timestamp: now },
        { pid: `TPMS_${pos}_B`, value: battery, timestamp: now },
      );
    }

    if (values.length > 0) {
      for (const cb of this.dataCallbacks) cb(values);
    }
  }
}
