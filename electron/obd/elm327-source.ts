import fs from 'fs';
import { constants } from 'fs';
import { execFileSync } from 'child_process';
import { DataSource } from './data-source';
import { OBDValue, OBDConnectionState } from './types';
import { OBD_PIDS } from './pids';
import { logger } from '../logger';

const COMMAND_TIMEOUT = 10000;
const READ_CHUNK_SIZE = 1024;
const BAUD_RATE = 38400;
const DEFAULT_DEVICE = '/dev/rfcomm0';

export class ELM327Source implements DataSource {
  private state: OBDConnectionState = 'disconnected';
  private fd: number | null = null;
  private devicePath: string = DEFAULT_DEVICE;
  private pollingPids: string[] = [];
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private polling = false;
  private pollAbort = false;
  private protocolName: string | null = null;
  /** Incremented on each connect; stale operations check this to abort. */
  private generation = 0;

  async connect(devicePath?: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      logger.info('ELM327', `connect() skipped (state=${this.state})`);
      return;
    }
    logger.info('ELM327', `connect() called (state=${this.state}, devicePath=${devicePath ?? 'default'})`);

    // Invalidate any stale operations from previous connect attempts
    const gen = ++this.generation;

    // Clean up any leftover fd from a previous failed connection
    await this.cleanup();

    this.setState('connecting');
    this.devicePath = devicePath || DEFAULT_DEVICE;

    try {
      // Open the serial device with O_NONBLOCK to prevent blocking the event loop
      this.fd = fs.openSync(this.devicePath, constants.O_RDWR | constants.O_NONBLOCK);

      // Configure serial port with stty after opening (stty on a closed/busy device can hang)
      this.configurePort();

      // Initialize ELM327 (following python-obd's proven sequence)
      await this.elmInit(gen);

      if (gen !== this.generation) return; // aborted
      this.setState('connected');
      this.startPolling(gen);
    } catch (err) {
      if (gen !== this.generation) return; // aborted by newer connect
      logger.error('ELM327', `Connect failed: ${err}`);
      await this.cleanup();
      this.setState('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    logger.info('ELM327', `disconnect() called (state=${this.state}, polling=${this.polling})`);
    // Invalidate any in-progress connect/poll operations
    this.generation++;
    this.pollAbort = true;
    this.polling = false;
    await this.cleanup();
    this.setState('disconnected');
  }

  getState(): OBDConnectionState {
    return this.state;
  }

  requestPids(pids: string[]): void {
    this.pollingPids = pids;
  }

  onData(callback: (values: OBDValue[]) => void): void {
    this.dataCallbacks.push(callback);
  }

  onConnectionChange(callback: (state: OBDConnectionState) => void): void {
    this.connectionCallbacks.push(callback);
  }

  dispose(): void {
    this.generation++;
    this.pollAbort = true;
    this.polling = false;
    this.cleanup(true); // restore hupcl so DTR drops and ELM327 resets cleanly
    this.dataCallbacks = [];
    this.connectionCallbacks = [];
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  /** Configure serial port and ensure O_NONBLOCK is active on our fd.
   *  stty is run via stdin redirection to our fd (avoids stty opening the device
   *  separately, which blocks on ttyACM without carrier detect).
   *  After stty, close and re-open with O_NONBLOCK since child_process clears the flag. */
  private configurePort(): void {
    if (this.fd === null) return;
    try {
      // stty without -F operates on stdin; pass our O_NONBLOCK fd as stdin
      execFileSync('stty', [
        String(BAUD_RATE), 'raw', '-echo', '-echoe', '-echok', '-echoctl', '-echoke',
        '-hupcl', 'clocal',
      ], {
        stdio: [this.fd, 'pipe', 'pipe'],
        timeout: 3000,
      });
      logger.info('ELM327', `stty configured: ${this.devicePath} ${BAUD_RATE} baud, raw mode`);
    } catch (err) {
      logger.warn('ELM327', `stty failed (may still work): ${err}`);
    }

    // Re-open with O_NONBLOCK — child_process clears O_NONBLOCK on the inherited fd.
    // -hupcl/clocal are already set, so close+open won't block or drop DTR.
    try {
      const oldFd = this.fd;
      this.fd = fs.openSync(this.devicePath, constants.O_RDWR | constants.O_NONBLOCK);
      try { fs.closeSync(oldFd); } catch { /* ignore */ }
      logger.info('ELM327', 'Re-opened with O_NONBLOCK');
    } catch (err) {
      logger.warn('ELM327', `Re-open failed (continuing with current fd): ${err}`);
    }
  }

  /** Check if the current operation is still valid (not superseded by disconnect/reconnect). */
  private assertGen(gen: number): void {
    if (gen !== this.generation) {
      throw new Error('Connection aborted (superseded)');
    }
  }

  /**
   * ELM327 initialization — mirrors python-obd's proven sequence:
   * 1. Wait for BT SPP to stabilize, drain until quiet
   * 2. Send garbage to elicit prompt '>'
   * 3. ATZ (reset, delay 1s, don't validate response)
   * 4. ATE0 (echo off, validate OK)
   * 5. ATH0 / ATL0 / ATS0
   * 6. ATSP0 + 0100 (auto protocol detection)
   * 7. ATDPN (read detected protocol)
   */
  private async elmInit(gen: number): Promise<void> {
    // 1. Wait for BT SPP to stabilize, then drain until no data for 500ms
    logger.info('ELM327', 'Waiting for serial to stabilize...');
    await this.drainUntilQuiet(2000, 500, gen);
    this.assertGen(gen);

    // 2. Send garbage bytes to get a '>' prompt (like python-obd auto_baudrate)
    logger.info('ELM327', 'Probing for ELM327 prompt...');
    let gotPrompt = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.assertGen(gen);
      try {
        await this.sendCommand('\x7F\x7F', gen);
        gotPrompt = true;
        break;
      } catch {
        this.assertGen(gen);
        logger.warn('ELM327', `Probe attempt ${attempt + 1} failed, retrying...`);
        await this.drainUntilQuiet(500, 200, gen);
      }
    }
    if (!gotPrompt) {
      throw new Error('No prompt from ELM327 (device not responding)');
    }

    // 3. ATZ (reset) — python-obd: "return data can be junk, so don't bother checking"
    this.assertGen(gen);
    try {
      const atzResp = await this.sendCommand('ATZ', gen);
      logger.info('ELM327', `ATZ → ${this.sanitize(atzResp)}`);
    } catch {
      this.assertGen(gen);
      logger.warn('ELM327', 'ATZ timed out (may be normal during reset)');
    }
    await new Promise((r) => setTimeout(r, 1000));
    this.assertGen(gen);
    await this.drainUntilQuiet(500, 200, gen);
    this.assertGen(gen);

    // 4. ATE0 (echo off) — first command that must succeed
    const ate0 = await this.sendCommand('ATE0', gen);
    logger.info('ELM327', `ATE0 → ${this.sanitize(ate0)}`);
    if (!ate0.includes('OK')) {
      logger.warn('ELM327', 'ATE0 did not return OK, continuing anyway');
    }

    // 5. ATH0, ATL0, ATS0
    for (const cmd of ['ATH0', 'ATL0', 'ATS0']) {
      this.assertGen(gen);
      const resp = await this.sendCommand(cmd, gen);
      logger.info('ELM327', `${cmd} → ${this.sanitize(resp)}`);
    }

    // 6. Protocol detection: ATSP0 → 0100 → ATDPN
    this.assertGen(gen);
    const sp0 = await this.sendCommand('ATSP0', gen);
    logger.info('ELM327', `ATSP0 → ${this.sanitize(sp0)}`);

    // 0100 triggers protocol search (may take several seconds)
    this.assertGen(gen);
    logger.info('ELM327', 'Searching for vehicle protocol (0100)...');
    const r0100 = await this.sendCommand('0100', gen);
    logger.info('ELM327', `0100 → ${this.sanitize(r0100)}`);
    if (r0100.toUpperCase().includes('UNABLE TO CONNECT')) {
      logger.warn('ELM327', 'Vehicle not responding (ignition off?)');
    }

    // ATDPN — read detected protocol number
    this.assertGen(gen);
    const dpn = await this.sendCommand('ATDPN', gen);
    logger.info('ELM327', `ATDPN → ${this.sanitize(dpn)}`);
    this.protocolName = dpn.replace(/^A/, '').trim(); // strip "A" prefix (auto)

    // 7. Verify with ATI
    this.assertGen(gen);
    const ati = await this.sendCommand('ATI', gen);
    logger.info('ELM327', `ATI → ${this.sanitize(ati)}`);
    if (!ati.includes('ELM327')) {
      throw new Error(`ELM327 not detected (ATI: ${this.sanitize(ati)})`);
    }

    logger.info('ELM327', `Initialized (protocol=${this.protocolName})`);
  }

  /**
   * Send command and wait for '>' prompt.
   * Drains input buffer before writing (like pyserial's flushInput).
   */
  private sendCommand(cmd: string, gen: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (gen !== this.generation) {
        reject(new Error('Connection aborted (superseded)'));
        return;
      }
      if (this.fd === null) {
        reject(new Error('Not connected'));
        return;
      }

      const fd = this.fd;

      // Flush input buffer before writing (critical — pyserial does this on every write)
      this.drainRead();

      const cmdBuf = Buffer.from(cmd + '\r', 'ascii');
      try {
        fs.writeSync(fd, cmdBuf);
      } catch (err) {
        reject(err);
        return;
      }

      let response = '';
      const readBuf = Buffer.alloc(READ_CHUNK_SIZE);
      const deadline = Date.now() + COMMAND_TIMEOUT;

      const readLoop = () => {
        // Abort if generation changed (disconnect/reconnect happened)
        if (gen !== this.generation) {
          reject(new Error('Connection aborted (superseded)'));
          return;
        }

        if (Date.now() > deadline) {
          reject(new Error(`Timeout waiting for response to: ${cmd}`));
          return;
        }

        try {
          const bytesRead = fs.readSync(fd, readBuf, 0, READ_CHUNK_SIZE, null);
          if (bytesRead > 0) {
            response += readBuf.toString('ascii', 0, bytesRead);
            if (response.includes('>')) {
              resolve(response.replace(/>/g, '').trim());
              return;
            }
          }
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EAGAIN') {
            // no data yet — keep trying
          } else {
            reject(err);
            return;
          }
        }

        setTimeout(readLoop, 10);
      };

      readLoop();
    });
  }

  /** Drain input buffer synchronously (like pyserial flushInput) */
  private drainRead(): void {
    if (this.fd === null) return;
    const buf = Buffer.alloc(READ_CHUNK_SIZE);
    let drained = 0;
    try {
      for (let i = 0; i < 50; i++) {
        const n = fs.readSync(this.fd, buf, 0, READ_CHUNK_SIZE, null);
        if (n === 0) break;
        drained += n;
      }
    } catch { /* EAGAIN = empty */ }
    if (drained > 0) {
      logger.info('ELM327', `Drained ${drained} bytes`);
    }
  }

  /**
   * Wait until no data arrives for `quietMs`, up to `maxWaitMs` total.
   * Used to wait for serial connection noise to stop.
   */
  private async drainUntilQuiet(maxWaitMs: number, quietMs: number, gen: number): Promise<void> {
    const start = Date.now();
    let lastDataTime = Date.now();
    let totalDrained = 0;

    while (Date.now() - start < maxWaitMs) {
      if (gen !== this.generation) return; // aborted

      this.drainRead();
      const buf = Buffer.alloc(READ_CHUNK_SIZE);
      let gotData = false;
      try {
        const n = fs.readSync(this.fd!, buf, 0, READ_CHUNK_SIZE, null);
        if (n > 0) {
          totalDrained += n;
          gotData = true;
          lastDataTime = Date.now();
        }
      } catch { /* EAGAIN = no data */ }

      if (!gotData && Date.now() - lastDataTime >= quietMs) {
        break; // quiet period achieved
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (totalDrained > 0) {
      logger.info('ELM327', `drainUntilQuiet: drained ${totalDrained} bytes total`);
    }
  }

  /** Sanitize response string for logging */
  private sanitize(s: string): string {
    return s.replace(/\r/g, '\\r').replace(/\n/g, '\\n').substring(0, 200);
  }

  private startPolling(gen: number): void {
    if (this.polling) return;
    this.polling = true;
    this.pollAbort = false;
    this.pollLoop(gen);
  }

  private async stopPolling(): Promise<void> {
    this.pollAbort = true;
    this.polling = false;
    await new Promise((r) => setTimeout(r, 200));
  }

  private async pollLoop(gen: number): Promise<void> {
    while (this.polling && !this.pollAbort && this.state === 'connected' && gen === this.generation) {
      try {
        const pids = this.pollingPids.length > 0
          ? this.pollingPids
          : Object.keys(OBD_PIDS);

        const values: OBDValue[] = [];
        const now = Date.now();

        for (const pid of pids) {
          if (this.pollAbort || gen !== this.generation) break;

          const pidDef = OBD_PIDS[pid];
          if (!pidDef) continue;

          const resp = await this.sendCommand(pid, gen);
          const value = this.parseResponse(pid, resp);
          if (value !== null) {
            values.push({ pid, value, timestamp: now });
          }
        }

        if (values.length > 0 && !this.pollAbort && gen === this.generation) {
          for (const cb of this.dataCallbacks) cb(values);
        }
      } catch (err) {
        if (gen !== this.generation) return; // aborted — don't set error state
        logger.error('ELM327', `Poll error: ${err}`);
        if (this.polling) {
          this.polling = false;
          await this.cleanup();
          this.setState('error');
        }
        return;
      }
    }
  }

  private parseResponse(pid: string, resp: string): number | null {
    const upper = resp.toUpperCase();
    if (upper.includes('NO DATA') || upper.includes('ERROR') || upper.includes('UNABLE TO CONNECT') || upper.includes('?')) {
      return null;
    }

    const pidDef = OBD_PIDS[pid];
    if (!pidDef) return null;

    const clean = resp.replace(/[\s\r\n]/g, '').toUpperCase();
    const expectedHeader = '41' + pid.substring(2);
    const idx = clean.indexOf(expectedHeader);
    if (idx === -1) return null;

    const dataHex = clean.substring(idx + expectedHeader.length);
    const bytes: number[] = [];
    for (let i = 0; i < pidDef.bytes * 2; i += 2) {
      if (i + 1 >= dataHex.length) return null;
      bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
    }

    if (bytes.some(isNaN)) return null;
    return pidDef.formula(bytes);
  }

  /**
   * Close serial fd. By default keeps -hupcl so DTR stays asserted and the
   * ELM327 doesn't reset (allows fast reconnect). Pass restoreHupcl=true
   * only on final dispose so the device resets cleanly for other programs.
   */
  private async cleanup(restoreHupcl = false): Promise<void> {
    if (this.fd !== null) {
      logger.info('ELM327', `cleanup: closing fd=${this.fd} (restoreHupcl=${restoreHupcl})`);
      if (restoreHupcl) {
        try {
          execFileSync('stty', ['hupcl', '-clocal'], {
            stdio: [this.fd, 'pipe', 'pipe'],
            timeout: 1000,
          });
        } catch { /* ignore — best effort */ }
      }
      try { fs.closeSync(this.fd); } catch (err) {
        logger.warn('ELM327', `cleanup: close failed: ${err}`);
      }
      this.fd = null;
    }
  }
}
