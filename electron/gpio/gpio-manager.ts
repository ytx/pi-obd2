import { logger } from '../logger';

// Dynamic import — onoff may not be available on non-Linux (dev Mac etc.)
let GpioClass: typeof import('onoff').Gpio | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const onoff = require('onoff');
  GpioClass = onoff.Gpio;
} catch {
  // onoff not available
}

export interface GpioChangeEvent {
  pin: number;
  value: number;
}

type GpioChangeCallback = (event: GpioChangeEvent) => void;

export class GpioManager {
  private gpios: Map<number, InstanceType<typeof import('onoff').Gpio>> = new Map();
  private callbacks: GpioChangeCallback[] = [];
  private accessible: boolean;

  constructor() {
    this.accessible = GpioClass?.accessible ?? false;
    if (!this.accessible) {
      logger.warn('gpio', 'GPIO not accessible (dev environment or missing /sys/class/gpio)');
    }
  }

  setup(pins: number[]): void {
    // Dispose existing watches
    this.disposeAll();

    if (!this.accessible || !GpioClass) {
      logger.info('gpio', `Stub mode — setup(${pins.join(', ')}) ignored`);
      return;
    }

    for (const pin of pins) {
      try {
        const gpio = new GpioClass(pin, 'in', 'both', { debounceTimeout: 50 });
        gpio.watch((err, value) => {
          if (err) {
            logger.error('gpio', `Pin ${pin} watch error: ${err.message}`);
            return;
          }
          logger.info('gpio', `Pin ${pin} changed to ${value}`);
          const event: GpioChangeEvent = { pin, value };
          for (const cb of this.callbacks) {
            cb(event);
          }
        });
        this.gpios.set(pin, gpio);
        logger.info('gpio', `Watching pin ${pin}`);
      } catch (err) {
        logger.error('gpio', `Failed to setup pin ${pin}: ${err}`);
      }
    }
  }

  read(pin: number): number {
    if (!this.accessible || !GpioClass) return 0;
    const gpio = this.gpios.get(pin);
    if (!gpio) return 0;
    try {
      return gpio.readSync();
    } catch (err) {
      logger.error('gpio', `Failed to read pin ${pin}: ${err}`);
      return 0;
    }
  }

  onChange(callback: GpioChangeCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  private disposeAll(): void {
    for (const [pin, gpio] of this.gpios) {
      try {
        gpio.unexport();
      } catch (err) {
        logger.error('gpio', `Failed to unexport pin ${pin}: ${err}`);
      }
    }
    this.gpios.clear();
  }

  dispose(): void {
    this.disposeAll();
    this.callbacks = [];
  }
}
