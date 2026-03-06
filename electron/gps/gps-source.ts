import { OBDValue, OBDConnectionState } from '../obd/types';

export interface GpsSource {
  connect(devicePath?: string): Promise<void>;
  disconnect(): Promise<void>;
  getState(): OBDConnectionState;
  onData(callback: (values: OBDValue[]) => void): void;
  onConnectionChange(callback: (state: OBDConnectionState) => void): void;
  dispose(): void;
}
