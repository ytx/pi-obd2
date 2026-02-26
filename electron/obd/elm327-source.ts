import fs from 'fs';
import { execSync } from 'child_process';
import { DataSource } from './data-source';
import { OBDValue, OBDConnectionState } from './types';
import { OBD_PIDS } from './pids';
import { logger } from '../logger';

const RFCOMM_DEV = '/dev/rfcomm0';
const COMMAND_TIMEOUT = 5000;
const READ_CHUNK_SIZE = 1024;

const AT_INIT_SEQUENCE = [
  'ATZ',   // Reset
  'ATE0',  // Echo off
  'ATH0',  // Headers off
  'ATL0',  // Linefeeds off
  'ATS0',  // Spaces off
  'ATSP0', // Auto protocol
];

export class ELM327Source implements DataSource {
  private state: OBDConnectionState = 'disconnected';
  private fd: number | null = null;
  private pollingPids: string[] = [];
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private polling = false;
  private pollAbort = false;

  async connect(btAddress?: string): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');

    try {
      // Bind rfcomm if address provided
      if (btAddress) {
        await this.rfcommBind(btAddress);
      }

      // Open the rfcomm device
      this.fd = fs.openSync(RFCOMM_DEV, 'r+');

      // Run AT init sequence
      await this.atInit();

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
    // Release any existing binding first (ignore errors)
    try {
      execSync('sudo rfcomm release 0', { stdio: 'pipe' });
    } catch { /* ignore */ }

    try {
      execSync(`sudo rfcomm bind 0 ${btAddress}`, { stdio: 'pipe' });
      logger.info('ELM327', `rfcomm bound to ${btAddress}`);
    } catch (err) {
      throw new Error(`rfcomm bind failed: ${err}`);
    }

    // Wait briefly for device node to appear
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(RFCOMM_DEV)) break;
      execSync('sleep 0.1');
    }
    if (!fs.existsSync(RFCOMM_DEV)) {
      throw new Error(`${RFCOMM_DEV} not found after rfcomm bind`);
    }

    // sudo rfcomm bind creates the device as root — fix permissions
    try {
      const uid = process.getuid?.() ?? 1000;
      const gid = process.getgid?.() ?? 1000;
      execSync(`sudo chown ${uid}:${gid} ${RFCOMM_DEV}`, { stdio: 'pipe' });
    } catch (err) {
      logger.warn('ELM327', `chown ${RFCOMM_DEV} failed: ${err}`);
    }
  }

  private async atInit(): Promise<void> {
    // python-obd approach: flush buffer, send garbage to elicit prompt, then ATZ
    // 1. Wait for BT SPP connection to stabilize
    await new Promise((r) => setTimeout(r, 500));
    this.drainRead();

    // 2. Send nonsense bytes + CR to get a prompt (like python-obd's auto_baudrate)
    //    This clears any stale data and confirms communication
    try {
      await this.sendCommand('\x7F\x7F');
    } catch { /* ignore timeout or garbage */ }
    this.drainRead();

    // 3. ATZ (reset) — response may contain junk, don't validate strictly
    //    python-obd: "return data can be junk, so don't bother checking"
    const atzResp = await this.sendCommand('ATZ');
    logger.info('ELM327', `ATZ → ${atzResp.replace(/\r/g, '\\r')}`);
    // Wait for ELM327 to finish resetting
    await new Promise((r) => setTimeout(r, 1000));
    this.drainRead();

    // 4. Remaining init commands — these should work cleanly after reset
    for (const cmd of AT_INIT_SEQUENCE.slice(1)) {
      const resp = await this.sendCommand(cmd);
      logger.info('ELM327', `${cmd} → ${resp.replace(/\r/g, '\\r')}`);
    }

    // 5. Verify communication by checking echo is off (send empty, expect just prompt)
    const verifyResp = await this.sendCommand('ATI');
    logger.info('ELM327', `ATI → ${verifyResp.replace(/\r/g, '\\r')}`);
    if (!verifyResp.includes('ELM327')) {
      throw new Error(`ELM327 not detected (ATI response: ${verifyResp})`);
    }
  }

  private sendCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.fd === null) {
        reject(new Error('Not connected'));
        return;
      }

      const fd = this.fd;
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
            // ELM327 prompt character signals end of response
            if (response.includes('>')) {
              resolve(response.replace(/>/g, '').trim());
              return;
            }
          }
        } catch (err: unknown) {
          // EAGAIN = no data available yet (non-blocking); keep trying
          if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EAGAIN') {
            // no data yet
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

  private drainRead(): void {
    if (this.fd === null) return;
    const buf = Buffer.alloc(READ_CHUNK_SIZE);
    let drained = 0;
    try {
      // Read and discard any buffered data (EAGAIN = empty, stop)
      for (let i = 0; i < 20; i++) {
        const n = fs.readSync(this.fd, buf, 0, READ_CHUNK_SIZE, null);
        if (n === 0) break;
        drained += n;
      }
    } catch { /* EAGAIN or other — buffer is empty */ }
    if (drained > 0) {
      logger.info('ELM327', `Drained ${drained} bytes of stale data`);
    }
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
    // Wait briefly for loop to exit
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

          // Send PID query (e.g. "010C")
          const resp = await this.sendCommand(pid);

          // Parse response
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
        // Connection lost
        if (this.polling) {
          this.polling = false;
          this.setState('error');
        }
        return;
      }
    }
  }

  private parseResponse(pid: string, resp: string): number | null {
    // Skip error responses
    const upper = resp.toUpperCase();
    if (upper.includes('NO DATA') || upper.includes('ERROR') || upper.includes('UNABLE TO CONNECT') || upper.includes('?')) {
      return null;
    }

    const pidDef = OBD_PIDS[pid];
    if (!pidDef) return null;

    // Clean: remove spaces, \r, \n
    const clean = resp.replace(/[\s\r\n]/g, '').toUpperCase();

    // Expected response header: "41" + mode-1 PID (e.g. pid "010C" → header "410C")
    const expectedHeader = '41' + pid.substring(2);
    const idx = clean.indexOf(expectedHeader);
    if (idx === -1) return null;

    // Extract data bytes after header
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
    // Close file descriptor
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch { /* ignore */ }
      this.fd = null;
    }

    // Release rfcomm
    try {
      execSync('sudo rfcomm release 0', { stdio: 'pipe' });
    } catch { /* ignore */ }
  }
}
