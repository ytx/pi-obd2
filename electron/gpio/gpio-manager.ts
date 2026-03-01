import { spawn, execSync, ChildProcess } from 'child_process';
import { logger } from '../logger';

const GPIO_CHIP = 'gpiochip0';

export interface GpioChangeEvent {
  pin: number;
  value: number;
}

type GpioChangeCallback = (event: GpioChangeEvent) => void;

function hasGpiomon(): boolean {
  try {
    execSync('which gpiomon', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export class GpioManager {
  private process: ChildProcess | null = null;
  private callbacks: GpioChangeCallback[] = [];
  private accessible: boolean;
  private watchedPins: number[] = [];

  constructor() {
    this.accessible = hasGpiomon();
    if (!this.accessible) {
      logger.warn('gpio', 'gpiomon not found — GPIO disabled');
    }
  }

  setup(pins: number[]): void {
    this.killProcess();
    this.watchedPins = pins;

    if (!this.accessible || pins.length === 0) {
      logger.info('gpio', `setup(${pins.join(', ')}) — ${this.accessible ? 'no pins' : 'stub mode'}`);
      return;
    }

    // gpiomon -c gpiochip0 -e both --debounce-period 50ms <offset> [<offset>...]
    const args = ['-c', GPIO_CHIP, '-e', 'both', '--debounce-period', '50ms', ...pins.map(String)];
    logger.info('gpio', `Starting: gpiomon ${args.join(' ')}`);

    const proc = spawn('gpiomon', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = proc;

    proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        // gpiomon v2 output format: "<timestamp>	<edge>	<chip> <offset>"
        // e.g. "1234567890.123456789	rising	gpiochip0 17"
        // or   "1234567890.123456789	falling	gpiochip0 17"
        const match = line.match(/\t(rising|falling)\t\S+\s+(\d+)/);
        if (!match) continue;
        const value = match[1] === 'rising' ? 1 : 0;
        const pin = parseInt(match[2], 10);
        logger.info('gpio', `Pin ${pin} ${match[1]} (value=${value})`);
        const event: GpioChangeEvent = { pin, value };
        for (const cb of this.callbacks) {
          cb(event);
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      logger.error('gpio', `gpiomon stderr: ${chunk.toString().trim()}`);
    });

    proc.on('exit', (code) => {
      if (this.process === proc) {
        logger.warn('gpio', `gpiomon exited with code ${code}`);
        this.process = null;
      }
    });
  }

  set(pin: number, value: number): void {
    if (!this.accessible) return;
    try {
      execSync(`gpioset -c ${GPIO_CHIP} ${pin}=${value}`, { stdio: 'pipe' });
      logger.info('gpio', `gpioset pin ${pin}=${value}`);
    } catch (err) {
      logger.error('gpio', `gpioset pin ${pin}=${value} failed: ${err}`);
    }
  }

  read(pin: number): number {
    if (!this.accessible) return 0;
    try {
      const output = execSync(`gpioget -c ${GPIO_CHIP} ${pin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      return parseInt(output.trim(), 10) || 0;
    } catch (err) {
      logger.error('gpio', `gpioget pin ${pin} failed: ${err}`);
      return 0;
    }
  }

  onChange(callback: GpioChangeCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  private killProcess(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  dispose(): void {
    this.killProcess();
    this.callbacks = [];
    this.watchedPins = [];
  }
}
