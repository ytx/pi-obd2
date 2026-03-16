import * as fs from 'fs';
import { OBDValue } from '../obd/types';
import { logger } from '../logger';

export interface CaptureStatus {
  capturing: boolean;
  filePath: string | null;
  count: number;
}

export class CaptureManager {
  private stream: fs.WriteStream | null = null;
  private filePath: string | null = null;
  private count = 0;

  start(filePath: string): void {
    if (this.stream) {
      this.stop();
    }
    this.filePath = filePath;
    this.count = 0;
    this.stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
    this.stream.on('error', (err) => {
      logger.error('capture', `Write error: ${err.message}`);
      this.stop();
    });
    logger.info('capture', `Started: ${filePath}`);
  }

  write(src: 'obd' | 'gps' | 'tpms', values: OBDValue[]): void {
    if (!this.stream) return;
    const line = JSON.stringify({
      t: Date.now(),
      src,
      values: values.map((v) => ({ pid: v.pid, value: v.value })),
    });
    this.stream.write(line + '\n');
    this.count++;
  }

  stop(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
      logger.info('capture', `Stopped: ${this.filePath} (${this.count} records)`);
    }
    this.filePath = null;
    this.count = 0;
  }

  isCapturing(): boolean {
    return this.stream !== null;
  }

  getStatus(): CaptureStatus {
    return {
      capturing: this.stream !== null,
      filePath: this.filePath,
      count: this.count,
    };
  }

  dispose(): void {
    this.stop();
  }
}
