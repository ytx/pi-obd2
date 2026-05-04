import fs from 'fs';
import { constants } from 'fs';
import { execFileSync } from 'child_process';
import { DataSource, DtcEntry } from './data-source';
import { OBDValue, OBDConnectionState } from './types';
import { OBD_PIDS } from './pids';
import { getDtcDescription } from './dtc-codes';
import { logger } from '../logger';

const COMMAND_TIMEOUT = 10000;
const PROTOCOL_SEARCH_TIMEOUT = 30000;
const READ_CHUNK_SIZE = 1024;
const DEFAULT_BAUD_RATE = 38400;
const DEFAULT_DEVICE = '/dev/rfcomm0';

export class ELM327Source implements DataSource {
  private state: OBDConnectionState = 'disconnected';
  private fd: number | null = null;
  private devicePath: string = DEFAULT_DEVICE;
  private baudRate: number = DEFAULT_BAUD_RATE;
  private pollingPids: string[] = [];
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private polling = false;
  private pollAbort = false;
  private protocolName: string | null = null;
  /** Incremented on each connect; stale operations check this to abort. */
  private generation = 0;

  async connect(devicePath?: string, baudRate?: number): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      logger.info('ELM327', `connect() skipped (state=${this.state})`);
      return;
    }
    logger.info('ELM327', `connect() called (state=${this.state}, devicePath=${devicePath ?? 'default'}, baud=${baudRate ?? DEFAULT_BAUD_RATE})`);

    // Invalidate any stale operations from previous connect attempts
    const gen = ++this.generation;

    // Clean up any leftover fd from a previous failed connection
    await this.cleanup();

    this.setState('connecting');
    this.devicePath = devicePath || DEFAULT_DEVICE;
    this.baudRate = baudRate ?? DEFAULT_BAUD_RATE;

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

  async readDtc(): Promise<DtcEntry[]> {
    if (this.state !== 'connected') return [];
    const gen = this.generation;
    const wasPolling = this.polling;
    if (wasPolling) {
      this.pollAbort = true;
      this.polling = false;
      await new Promise((r) => setTimeout(r, 200));
    }
    try {
      const resp = await this.sendCommand('03', gen);
      logger.info('ELM327', `Mode 03 → ${this.sanitize(resp)}`);
      const codes = this.parseDtcResponse(resp);
      return codes.map((code) => ({ code, description: getDtcDescription(code) }));
    } catch (err) {
      logger.error('ELM327', `readDtc failed: ${err}`);
      return [];
    } finally {
      if (wasPolling && gen === this.generation && this.state === 'connected') {
        this.startPolling(gen);
      }
    }
  }

  async clearDtc(): Promise<void> {
    if (this.state !== 'connected') return;
    const gen = this.generation;
    const wasPolling = this.polling;
    if (wasPolling) {
      this.pollAbort = true;
      this.polling = false;
      await new Promise((r) => setTimeout(r, 200));
    }
    try {
      const resp = await this.sendCommand('04', gen);
      logger.info('ELM327', `Mode 04 → ${this.sanitize(resp)}`);
    } catch (err) {
      logger.error('ELM327', `clearDtc failed: ${err}`);
    } finally {
      if (wasPolling && gen === this.generation && this.state === 'connected') {
        this.startPolling(gen);
      }
    }
  }

  private parseDtcResponse(resp: string): string[] {
    const clean = resp.replace(/[\s\r\n]/g, '').toUpperCase();
    const codes: string[] = [];
    // Find all "43" headers (Mode 03 response = 0x40 + 0x03)
    let pos = 0;
    while (pos < clean.length) {
      const idx = clean.indexOf('43', pos);
      if (idx === -1) break;
      // After "43", there's 1 byte (2 hex chars) for byte count in some protocols,
      // but with ATH0/ATS0 the response is just "43" followed by DTC pairs.
      // Each DTC is 2 bytes (4 hex chars). A single response line has up to 3 DTCs (6 bytes after header).
      let dataStart = idx + 2;
      // Parse up to 3 DTCs per "43" frame
      for (let i = 0; i < 3; i++) {
        if (dataStart + 4 > clean.length) break;
        const hex = clean.substring(dataStart, dataStart + 4);
        dataStart += 4;
        const val = parseInt(hex, 16);
        if (isNaN(val) || val === 0) continue; // 0x0000 = padding
        const category = ['P', 'C', 'B', 'U'][(val >> 14) & 0x03];
        const digit2 = (val >> 12) & 0x03;
        const digit3 = (val >> 8) & 0x0F;
        const digit4 = (val >> 4) & 0x0F;
        const digit5 = val & 0x0F;
        codes.push(`${category}${digit2}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}${digit5.toString(16).toUpperCase()}`);
      }
      pos = dataStart;
    }
    return codes;
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
        String(this.baudRate), 'raw', '-echo', '-echoe', '-echok', '-echoctl', '-echoke',
        '-hupcl', 'clocal',
      ], {
        stdio: [this.fd, 'pipe', 'pipe'],
        timeout: 3000,
      });
      logger.info('ELM327', `stty configured: ${this.devicePath} ${this.baudRate} baud, raw mode`);
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

    // 0100 triggers protocol search — genuine ELM327 may stay in SEARCHING
    // for 5-15s during first connect (vehicle ECU handshake). Use extended timeout.
    this.assertGen(gen);
    logger.info('ELM327', `Searching for vehicle protocol (0100, timeout=${PROTOCOL_SEARCH_TIMEOUT}ms)...`);
    const r0100 = await this.sendCommand('0100', gen, PROTOCOL_SEARCH_TIMEOUT);
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
  private sendCommand(cmd: string, gen: number, timeoutMs: number = COMMAND_TIMEOUT): Promise<string> {
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
      const deadline = Date.now() + timeoutMs;
      let lastDataTime = 0;

      const readLoop = () => {
        // Abort if generation changed (disconnect/reconnect happened)
        if (gen !== this.generation) {
          reject(new Error('Connection aborted (superseded)'));
          return;
        }

        if (Date.now() > deadline) {
          logger.warn('ELM327', `Timeout for ${cmd}, partial response (${response.length} bytes): ${this.sanitize(response)}`);
          reject(new Error(`Timeout waiting for response to: ${cmd}`));
          return;
        }

        // If we have data but no '>' for 1 second, treat response as complete
        // (some ELM327 clones hang without sending '>' after '?' error responses).
        // Skip this for 'SEARCHING...' — genuine ELM327 (e.g. OBDLink SX) goes
        // silent for several seconds while searching for the vehicle protocol;
        // wait the full command timeout for '>' or the actual response.
        if (
          lastDataTime > 0 &&
          Date.now() - lastDataTime > 1000 &&
          !response.includes('SEARCHING')
        ) {
          logger.warn('ELM327', `No '>' prompt for ${cmd}, using partial response: ${this.sanitize(response)}`);
          resolve(response.trim());
          return;
        }

        try {
          const bytesRead = fs.readSync(fd, readBuf, 0, READ_CHUNK_SIZE, null);
          if (bytesRead > 0) {
            response += readBuf.toString('ascii', 0, bytesRead);
            lastDataTime = Date.now();
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

          // After '?' error (ELM327 confused, no '>' sent), resync by sending
          // an empty command to get a fresh '>' prompt before continuing.
          if (resp.includes('?')) {
            await new Promise((r) => setTimeout(r, 100));
            this.drainRead();
            try {
              await this.sendCommand('', gen);
            } catch {
              // resync failed — drain and continue
              this.drainRead();
            }
          }

          // Brief pause between commands — some ELM327 clones need time to
          // reset their parser after responding.
          await new Promise((r) => setTimeout(r, 50));
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
   *
   * Normal cleanup uses async fs.close() to avoid blocking the event loop.
   * USB serial drivers (cp210x, ch341, ftdi_sio) have a closing_wait of 30s
   * by default — close() blocks until the output buffer drains or the timeout
   * expires.  When the ELM327 is unresponsive this blocks for the full 30s,
   * delaying setState('error') and the USB-reset recovery path.
   *
   * dispose() uses sync closeSync so DTR drops before process exit.
   */
  private async cleanup(restoreHupcl = false): Promise<void> {
    if (this.fd !== null) {
      const fd = this.fd;
      this.fd = null; // prevent further use immediately
      logger.info('ELM327', `cleanup: closing fd=${fd} (restoreHupcl=${restoreHupcl})`);
      if (restoreHupcl) {
        // Synchronous path — dispose() needs DTR to drop before process exits
        try {
          execFileSync('stty', ['hupcl', '-clocal'], {
            stdio: [fd, 'pipe', 'pipe'],
            timeout: 1000,
          });
        } catch { /* ignore — best effort */ }
        try { fs.closeSync(fd); } catch (err) {
          logger.warn('ELM327', `cleanup: close failed: ${err}`);
        }
      } else {
        // Async close — avoids blocking event loop on USB serial closing_wait
        await new Promise<void>((resolve) => {
          fs.close(fd, (err) => {
            if (err) logger.warn('ELM327', `cleanup: close failed: ${err}`);
            resolve();
          });
        });
      }
    }
  }
}
