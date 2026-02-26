import fs from 'fs';
import { execSync } from 'child_process';
import { DataSource } from './data-source';
import { OBDValue, OBDConnectionState } from './types';
import { OBD_PIDS } from './pids';
import { logger } from '../logger';

const RFCOMM_DEV = '/dev/rfcomm0';
const COMMAND_TIMEOUT = 10000;
const READ_CHUNK_SIZE = 1024;
const BAUD_RATE = 38400;

export class ELM327Source implements DataSource {
  private state: OBDConnectionState = 'disconnected';
  private fd: number | null = null;
  private pollingPids: string[] = [];
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private polling = false;
  private pollAbort = false;
  private protocolName: string | null = null;

  async connect(btAddress?: string): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');

    try {
      if (btAddress) {
        this.rfcommBind(btAddress);
      }

      // Configure serial port with stty (like pyserial's Serial() constructor)
      this.configurePort();

      // Open the rfcomm device
      this.fd = fs.openSync(RFCOMM_DEV, 'r+');

      // Initialize ELM327 (following python-obd's proven sequence)
      await this.elmInit();

      this.setState('connected');
      this.startPolling();
    } catch (err) {
      logger.error('ELM327', `Connect failed: ${err}`);
      await this.cleanup();
      this.setState('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this.stopPolling();
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
    this.stopPolling();
    this.cleanup();
    this.dataCallbacks = [];
    this.connectionCallbacks = [];
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  private rfcommBind(btAddress: string): void {
    try {
      execSync('sudo rfcomm release 0', { stdio: 'pipe' });
    } catch { /* ignore */ }

    try {
      execSync(`sudo rfcomm bind 0 ${btAddress}`, { stdio: 'pipe' });
      logger.info('ELM327', `rfcomm bound to ${btAddress}`);
    } catch (err) {
      throw new Error(`rfcomm bind failed: ${err}`);
    }

    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(RFCOMM_DEV)) break;
      execSync('sleep 0.1');
    }
    if (!fs.existsSync(RFCOMM_DEV)) {
      throw new Error(`${RFCOMM_DEV} not found after rfcomm bind`);
    }

    try {
      const uid = process.getuid?.() ?? 1000;
      const gid = process.getgid?.() ?? 1000;
      execSync(`sudo chown ${uid}:${gid} ${RFCOMM_DEV}`, { stdio: 'pipe' });
    } catch (err) {
      logger.warn('ELM327', `chown ${RFCOMM_DEV} failed: ${err}`);
    }
  }

  /** Configure serial port settings (equivalent to pyserial's Serial() params) */
  private configurePort(): void {
    try {
      execSync(
        `stty -F ${RFCOMM_DEV} ${BAUD_RATE} raw -echo -echoe -echok -echoctl -echoke`,
        { stdio: 'pipe' },
      );
      logger.info('ELM327', `stty configured: ${BAUD_RATE} baud, raw mode`);
    } catch (err) {
      logger.warn('ELM327', `stty failed (may still work): ${err}`);
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
  private async elmInit(): Promise<void> {
    // 1. Wait for BT SPP to stabilize, then drain until no data for 1s
    logger.info('ELM327', 'Waiting for BT SPP to stabilize...');
    await this.drainUntilQuiet(2000, 500);

    // 2. Send garbage bytes to get a '>' prompt (like python-obd auto_baudrate)
    logger.info('ELM327', 'Probing for ELM327 prompt...');
    let gotPrompt = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.sendCommand('\x7F\x7F');
        gotPrompt = true;
        break;
      } catch {
        logger.warn('ELM327', `Probe attempt ${attempt + 1} failed, retrying...`);
        await this.drainUntilQuiet(500, 200);
      }
    }
    if (!gotPrompt) {
      throw new Error('No prompt from ELM327 (device not responding)');
    }

    // 3. ATZ (reset) — python-obd: "return data can be junk, so don't bother checking"
    try {
      const atzResp = await this.sendCommand('ATZ');
      logger.info('ELM327', `ATZ → ${this.sanitize(atzResp)}`);
    } catch {
      logger.warn('ELM327', 'ATZ timed out (may be normal during reset)');
    }
    await new Promise((r) => setTimeout(r, 1000));
    await this.drainUntilQuiet(500, 200);

    // 4. ATE0 (echo off) — first command that must succeed
    const ate0 = await this.sendCommand('ATE0');
    logger.info('ELM327', `ATE0 → ${this.sanitize(ate0)}`);
    if (!ate0.includes('OK')) {
      logger.warn('ELM327', 'ATE0 did not return OK, continuing anyway');
    }

    // 5. ATH0, ATL0, ATS0
    for (const cmd of ['ATH0', 'ATL0', 'ATS0']) {
      const resp = await this.sendCommand(cmd);
      logger.info('ELM327', `${cmd} → ${this.sanitize(resp)}`);
    }

    // 6. Protocol detection: ATSP0 → 0100 → ATDPN
    const sp0 = await this.sendCommand('ATSP0');
    logger.info('ELM327', `ATSP0 → ${this.sanitize(sp0)}`);

    // 0100 triggers protocol search (may take several seconds)
    logger.info('ELM327', 'Searching for vehicle protocol (0100)...');
    const r0100 = await this.sendCommand('0100');
    logger.info('ELM327', `0100 → ${this.sanitize(r0100)}`);
    if (r0100.toUpperCase().includes('UNABLE TO CONNECT')) {
      logger.warn('ELM327', 'Vehicle not responding (ignition off?)');
    }

    // ATDPN — read detected protocol number
    const dpn = await this.sendCommand('ATDPN');
    logger.info('ELM327', `ATDPN → ${this.sanitize(dpn)}`);
    this.protocolName = dpn.replace(/^A/, '').trim(); // strip "A" prefix (auto)

    // 7. Verify with ATI
    const ati = await this.sendCommand('ATI');
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
  private sendCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.fd === null) {
        reject(new Error('Not connected'));
        return;
      }

      const fd = this.fd;

      // Flush input buffer before writing (critical — pyserial does this on every write)
      this.drainRead();

      const cmdBuf = Buffer.from(cmd + '\r', 'ascii');
      fs.writeSync(fd, cmdBuf);

      let response = '';
      const readBuf = Buffer.alloc(READ_CHUNK_SIZE);
      const deadline = Date.now() + COMMAND_TIMEOUT;

      const readLoop = () => {
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
   * Used to wait for BT SPP connection noise to stop.
   */
  private async drainUntilQuiet(maxWaitMs: number, quietMs: number): Promise<void> {
    const start = Date.now();
    let lastDataTime = Date.now();
    let totalDrained = 0;

    while (Date.now() - start < maxWaitMs) {
      const before = totalDrained;
      this.drainRead();
      // drainRead logs its own count; we track via fd reads
      // Just check if time since last data exceeds quietMs
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

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.pollAbort = false;
    this.pollLoop();
  }

  private async stopPolling(): Promise<void> {
    this.pollAbort = true;
    this.polling = false;
    await new Promise((r) => setTimeout(r, 200));
  }

  private async pollLoop(): Promise<void> {
    while (this.polling && !this.pollAbort && this.state === 'connected') {
      try {
        const pids = this.pollingPids.length > 0
          ? this.pollingPids
          : Object.keys(OBD_PIDS);

        const values: OBDValue[] = [];
        const now = Date.now();

        for (const pid of pids) {
          if (this.pollAbort) break;

          const pidDef = OBD_PIDS[pid];
          if (!pidDef) continue;

          const resp = await this.sendCommand(pid);
          const value = this.parseResponse(pid, resp);
          if (value !== null) {
            values.push({ pid, value, timestamp: now });
          }
        }

        if (values.length > 0 && !this.pollAbort) {
          for (const cb of this.dataCallbacks) cb(values);
        }
      } catch (err) {
        logger.error('ELM327', `Poll error: ${err}`);
        if (this.polling) {
          this.polling = false;
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

  private async cleanup(): Promise<void> {
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = null;
    }
    try {
      execSync('sudo rfcomm release 0', { stdio: 'pipe' });
    } catch { /* ignore */ }
  }
}
