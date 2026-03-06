import * as pty from 'node-pty';
import { logger } from '../logger';

export class TerminalManager {
  private process: pty.IPty | null = null;
  private outputCallbacks: ((data: string) => void)[] = [];
  private exitCallbacks: ((code: number) => void)[] = [];

  spawn(cols: number, rows: number): void {
    if (this.process) {
      this.kill();
    }
    logger.info('terminal', `Spawning bash (${cols}x${rows})`);
    this.process = pty.spawn('/bin/bash', [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || '/',
      env: process.env as Record<string, string>,
    });
    this.process.onData((data) => {
      for (const cb of this.outputCallbacks) cb(data);
    });
    this.process.onExit(({ exitCode }) => {
      logger.info('terminal', `Process exited (code=${exitCode})`);
      this.process = null;
      for (const cb of this.exitCallbacks) cb(exitCode);
    });
  }

  write(data: string): void {
    this.process?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.process) {
      try {
        this.process.resize(cols, rows);
      } catch (err) {
        logger.error('terminal', `Resize failed: ${err}`);
      }
    }
  }

  kill(): void {
    if (this.process) {
      logger.info('terminal', 'Killing process');
      try {
        this.process.kill();
      } catch {
        // Already dead
      }
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  onOutput(cb: (data: string) => void): void {
    this.outputCallbacks.push(cb);
  }

  onExit(cb: (code: number) => void): void {
    this.exitCallbacks.push(cb);
  }

  dispose(): void {
    this.kill();
    this.outputCallbacks = [];
    this.exitCallbacks = [];
  }
}
