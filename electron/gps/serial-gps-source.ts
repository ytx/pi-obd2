import fs from 'fs';
import { constants } from 'fs';
import { execFileSync } from 'child_process';
import { GpsSource } from './gps-source';
import { OBDValue, OBDConnectionState } from '../obd/types';
import { parseRmc, parseGga } from './nmea-parser';
import { GPS_PIDS } from './gps-pids';
import { logger } from '../logger';

const BAUD_RATE = 9600;
const READ_CHUNK_SIZE = 1024;
const READ_INTERVAL_MS = 100;
const CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_DEVICE = '/dev/ttyACM0';

export class SerialGpsSource implements GpsSource {
  private state: OBDConnectionState = 'disconnected';
  private fd: number | null = null;
  private devicePath: string = DEFAULT_DEVICE;
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private readTimer: ReturnType<typeof setInterval> | null = null;
  private lineBuffer = '';
  private generation = 0;

  async connect(devicePath?: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      logger.info('GPS', `connect() skipped (state=${this.state})`);
      return;
    }
    const gen = ++this.generation;
    await this.cleanup();
    this.setState('connecting');
    this.devicePath = devicePath || DEFAULT_DEVICE;

    try {
      this.fd = fs.openSync(this.devicePath, constants.O_RDWR | constants.O_NONBLOCK);
      this.configurePort();

      // Wait for valid NMEA data to confirm GPS is responding
      await this.waitForNmea(gen);

      if (gen !== this.generation) return;
      this.setState('connected');
      this.startReading(gen);
    } catch (err) {
      if (gen !== this.generation) return;
      logger.error('GPS', `Connect failed: ${err}`);
      await this.cleanup();
      this.setState('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    logger.info('GPS', `disconnect() called (state=${this.state})`);
    this.generation++;
    this.stopReading();
    await this.cleanup();
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
    this.generation++;
    this.stopReading();
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = null;
    }
    this.dataCallbacks = [];
    this.connectionCallbacks = [];
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  private configurePort(): void {
    if (this.fd === null) return;
    try {
      execFileSync('stty', [
        String(BAUD_RATE), 'raw', '-echo', '-echoe', '-echok', '-echoctl', '-echoke',
        '-hupcl', 'clocal',
      ], {
        stdio: [this.fd, 'pipe', 'pipe'],
        timeout: 3000,
      });
      logger.info('GPS', `stty configured: ${this.devicePath} ${BAUD_RATE} baud, raw mode`);
    } catch (err) {
      logger.warn('GPS', `stty failed (may still work): ${err}`);
    }

    // Re-open with O_NONBLOCK (child_process clears the flag)
    try {
      const oldFd = this.fd;
      this.fd = fs.openSync(this.devicePath, constants.O_RDWR | constants.O_NONBLOCK);
      try { fs.closeSync(oldFd); } catch { /* ignore */ }
      logger.info('GPS', 'Re-opened with O_NONBLOCK');
    } catch (err) {
      logger.warn('GPS', `Re-open failed (continuing with current fd): ${err}`);
    }
  }

  /** Wait for a valid NMEA sentence within CONNECT_TIMEOUT_MS. */
  private waitForNmea(gen: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + CONNECT_TIMEOUT_MS;
      let buf = '';
      const readBuf = Buffer.alloc(READ_CHUNK_SIZE);

      const check = () => {
        if (gen !== this.generation) {
          reject(new Error('Connection aborted'));
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('No NMEA data from GPS (timeout)'));
          return;
        }
        try {
          const n = fs.readSync(this.fd!, readBuf, 0, READ_CHUNK_SIZE, null);
          if (n > 0) {
            buf += readBuf.toString('ascii', 0, n);
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('$GP') || trimmed.startsWith('$GN')) {
                logger.info('GPS', `Got NMEA: ${trimmed.substring(0, 40)}`);
                resolve();
                return;
              }
            }
          }
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code !== 'EAGAIN') {
            reject(err);
            return;
          }
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  private startReading(gen: number): void {
    this.stopReading();
    this.lineBuffer = '';
    const readBuf = Buffer.alloc(READ_CHUNK_SIZE);

    this.readTimer = setInterval(() => {
      if (gen !== this.generation || this.fd === null) {
        this.stopReading();
        return;
      }
      try {
        const n = fs.readSync(this.fd, readBuf, 0, READ_CHUNK_SIZE, null);
        if (n > 0) {
          this.lineBuffer += readBuf.toString('ascii', 0, n);
          this.processLines();
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EAGAIN') {
          return; // no data yet
        }
        logger.error('GPS', `Read error: ${err}`);
        this.stopReading();
        this.cleanup();
        this.setState('error');
      }
    }, READ_INTERVAL_MS);
  }

  private stopReading(): void {
    if (this.readTimer) {
      clearInterval(this.readTimer);
      this.readTimer = null;
    }
  }

  private processLines(): void {
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';
    const now = Date.now();
    const values: OBDValue[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('$')) continue;

      const rmc = parseRmc(trimmed);
      if (rmc) {
        if (rmc.valid) {
          values.push({ pid: 'GPS_LAT', value: rmc.lat, timestamp: now });
          values.push({ pid: 'GPS_LON', value: rmc.lon, timestamp: now });
          values.push({ pid: 'GPS_SPD', value: rmc.speedKmh, timestamp: now });
          values.push({ pid: 'GPS_HDG', value: rmc.heading, timestamp: now });
        }
        values.push({ pid: 'GPS_UTC', value: rmc.utcTime, timestamp: now });
        continue;
      }

      const gga = parseGga(trimmed);
      if (gga) {
        values.push({ pid: 'GPS_SAT', value: gga.satellites, timestamp: now });
        if (gga.fixQuality > 0) {
          values.push({ pid: 'GPS_ALT', value: gga.altitude, timestamp: now });
        }
        continue;
      }
    }

    if (values.length > 0) {
      for (const cb of this.dataCallbacks) cb(values);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.fd !== null) {
      const fd = this.fd;
      this.fd = null;
      logger.info('GPS', `cleanup: closing fd=${fd}`);
      await new Promise<void>((resolve) => {
        fs.close(fd, (err) => {
          if (err) logger.warn('GPS', `cleanup: close failed: ${err}`);
          resolve();
        });
      });
    }
  }
}
