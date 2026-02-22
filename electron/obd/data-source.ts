import { OBDValue, OBDConnectionState } from './types';

export interface DataSource {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getState(): OBDConnectionState;
  requestPids(pids: string[]): void;
  onData(callback: (values: OBDValue[]) => void): void;
  onConnectionChange(callback: (state: OBDConnectionState) => void): void;
  dispose(): void;
}
