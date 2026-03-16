import { OBDValue, OBDConnectionState } from '../obd/types';

export interface TpmsSensorInfo {
  id: string;           // BLE peripheral UUID
  pressure: number;     // kPa (gauge)
  temperature: number;  // °C
  battery: number;      // V
  rssi: number;
  lastSeen: number;     // timestamp
}

export type TirePosition = 'FL' | 'FR' | 'RL' | 'RR';

export interface TpmsSource {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getState(): OBDConnectionState;
  onData(callback: (values: OBDValue[]) => void): void;
  onConnectionChange(callback: (state: OBDConnectionState) => void): void;
  onSensorDiscovered(callback: (sensor: TpmsSensorInfo) => void): void;
  getSensors(): TpmsSensorInfo[];
  assignSensor(sensorId: string, position: TirePosition): void;
  unassignSensor(position: TirePosition): void;
  getAssignments(): Record<TirePosition, string | null>;
  setAssignments(assignments: Record<TirePosition, string | null>): void;
  dispose(): void;
}
