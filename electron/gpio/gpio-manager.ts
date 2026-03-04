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
  /** gpioset processes per pin (libgpiod v2 holds the line while running) */
  private setProcesses: Map<number, ChildProcess> = new Map();
  /** Cached pin values: initial read by gpioget, then updated by gpiomon events */
  private pinValues: Map<number, number> = new Map();

  constructor() {
    this.accessible = hasGpiomon();
    if (!this.accessible) {
      logger.warn('gpio', 'gpiomon not found — GPIO disabled');
    } else {
      this.killOrphanedGpioset();
    }
  }

  /** Kill any orphaned gpioset processes from previous runs.
   *  These can remain if the app was killed without proper cleanup,
   *  and they hold GPIO lines preventing gpiomon from requesting them. */
  private killOrphanedGpioset(): void {
    try {
      const output = execSync('pgrep -a gpioset', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = output.trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        logger.info('gpio', `Killing ${lines.length} orphaned gpioset process(es)`);
        execSync('pkill gpioset', { stdio: 'pipe' });
      }
    } catch {
      // pgrep returns exit code 1 when no processes found — that's fine
    }
  }

  setup(pins: number[]): void {
    this.killProcess();
    this.watchedPins = pins;

    if (!this.accessible || pins.length === 0) {
      logger.info('gpio', `setup(${pins.join(', ')}) — ${this.accessible ? 'no pins' : 'stub mode'}`);
      return;
    }

    // Read initial pin values BEFORE gpiomon takes hold of the lines
    for (const pin of pins) {
      try {
        const output = execSync(`gpioget --numeric --bias=disabled -c ${GPIO_CHIP} ${pin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        const value = parseInt(output.trim(), 10) || 0;
        this.pinValues.set(pin, value);
        logger.info('gpio', `Initial read: pin ${pin} = ${value}`);
      } catch (err) {
        logger.warn('gpio', `gpioget pin ${pin} failed (initial read): ${err}`);
      }
    }

    // gpiomon -c gpiochip0 --bias=disabled -e both --debounce-period 50ms <offset> [<offset>...]
    const args = ['-c', GPIO_CHIP, '--bias=disabled', '-e', 'both', '--debounce-period', '50ms', ...pins.map(String)];
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
        this.pinValues.set(pin, value);
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

  /** Set a GPIO pin to output value. Uses spawn (not execSync) because
   *  libgpiod v2's gpioset holds the line while running — execSync would block forever.
   *  The spawned process is kept alive to maintain the line state. */
  set(pin: number, value: number): void {
    if (!this.accessible) return;
    // Kill previous gpioset for this pin
    const prev = this.setProcesses.get(pin);
    if (prev) {
      prev.kill();
      this.setProcesses.delete(pin);
    }
    const proc = spawn('gpioset', ['-c', GPIO_CHIP, `${pin}=${value}`], {
      stdio: 'ignore',
    });
    this.setProcesses.set(pin, proc);
    proc.on('exit', () => {
      if (this.setProcesses.get(pin) === proc) {
        this.setProcesses.delete(pin);
      }
    });
    proc.on('error', (err) => {
      logger.error('gpio', `gpioset pin ${pin}=${value} failed: ${err}`);
    });
    logger.info('gpio', `gpioset pin ${pin}=${value} (pid=${proc.pid})`);
  }

  /** Read cached pin value. For watched pins, returns the value from initial
   *  gpioget read or latest gpiomon event. For unwatched pins, falls back to gpioget. */
  read(pin: number): number {
    if (!this.accessible) return 0;
    const cached = this.pinValues.get(pin);
    if (cached !== undefined) return cached;
    // Unwatched pin — try gpioget directly
    try {
      const output = execSync(`gpioget --numeric --bias=disabled -c ${GPIO_CHIP} ${pin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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
    for (const proc of this.setProcesses.values()) {
      proc.kill();
    }
    this.setProcesses.clear();
    this.callbacks = [];
    this.watchedPins = [];
  }
}
