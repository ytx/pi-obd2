export interface TimePoint {
  value: number;
  timestamp: number;
}

export class TimeBuffer {
  private buffer: TimePoint[] = [];
  private maxSize: number;

  constructor(maxSize = 300) {
    this.maxSize = maxSize;
  }

  push(value: number, timestamp: number = Date.now()): void {
    this.buffer.push({ value, timestamp });
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getWindow(windowMs: number): TimePoint[] {
    const cutoff = Date.now() - windowMs;
    return this.buffer.filter((p) => p.timestamp >= cutoff);
  }

  clear(): void {
    this.buffer = [];
  }

  get length(): number {
    return this.buffer.length;
  }
}
