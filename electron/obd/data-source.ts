import { OBDValue, OBDConnectionState } from './types';

export interface DtcEntry {
  code: string;
  description: string;
}

export interface DataSource {
  connect(devicePath?: string): Promise<void>;
  disconnect(): Promise<void>;
  getState(): OBDConnectionState;
  requestPids(pids: string[]): void;
  onData(callback: (values: OBDValue[]) => void): void;
  onConnectionChange(callback: (state: OBDConnectionState) => void): void;
  readDtc(): Promise<DtcEntry[]>;
  clearDtc(): Promise<void>;
  dispose(): void;
}
