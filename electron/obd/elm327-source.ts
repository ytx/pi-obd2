import { DataSource } from './data-source';
import { OBDValue, OBDConnectionState } from './types';

export class ELM327Source implements DataSource {
  private state: OBDConnectionState = 'disconnected';
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];

  async connect(): Promise<void> {
    // TODO: Bluetooth SPP connection (future phase)
    this.setState('error');
    throw new Error('ELM327 connection not yet implemented. Use stub mode.');
  }

  async disconnect(): Promise<void> {
    this.setState('disconnected');
  }

  getState(): OBDConnectionState {
    return this.state;
  }

  requestPids(_pids: string[]): void {
    // TODO: Set polling PID list
  }

  onData(_callback: (values: OBDValue[]) => void): void {
    // TODO: Register data callback
  }

  onConnectionChange(callback: (state: OBDConnectionState) => void): void {
    this.connectionCallbacks.push(callback);
  }

  dispose(): void {
    this.connectionCallbacks = [];
  }

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }
}
