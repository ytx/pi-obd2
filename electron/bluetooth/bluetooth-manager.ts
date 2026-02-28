import { execFile, execSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';

interface BTDevice {
  address: string;
  name: string;
  paired: boolean;
  connected: boolean;
  rssi?: number;
}

function exec(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr?.trim() || stdout?.trim() || err.message;
        reject(new Error(detail));
      } else {
        resolve(stdout);
      }
    });
  });
}

export class BluetoothManager {
  private scanning = false;
  private agentReady = false;

  async ensureAgent(): Promise<void> {
    if (this.agentReady) return;
    try {
      // Unblock and power on (overlay FS resets rfkill state on each boot)
      try { await exec('rfkill', ['unblock', 'bluetooth'], 3000); } catch { /* ignore */ }
      try { await exec('bluetoothctl', ['power', 'on'], 3000); } catch { /* ignore */ }
      await exec('bluetoothctl', ['agent', 'NoInputNoOutput']);
      await exec('bluetoothctl', ['default-agent']);
      this.agentReady = true;
    } catch {
      // Agent may already be registered — not fatal
    }
  }

  async scan(durationMs = 30000): Promise<BTDevice[]> {
    if (this.scanning) return this.getDevices();
    this.scanning = true;
    try {
      await this.ensureAgent();
      // bluetoothctl is interactive — pipe commands via stdin to keep it alive
      const scanProc: ChildProcess = spawn('bluetoothctl', [], {
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      scanProc.stdin!.write('scan on\n');
      // Wait for discovery period, then stop
      await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
      scanProc.stdin!.write('scan off\n');
      scanProc.stdin!.end();
      // Give bluetoothctl a moment to shut down cleanly
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          scanProc.kill();
          resolve();
        }, 3000);
        scanProc.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      return this.getDevices();
    } finally {
      this.scanning = false;
    }
  }

  async getDevices(): Promise<BTDevice[]> {
    try {
      const output = await exec('bluetoothctl', ['devices']);
      const lines = output.trim().split('\n').filter(Boolean);
      const devices: BTDevice[] = [];
      for (const line of lines) {
        // Format: "Device AA:BB:CC:DD:EE:FF Name"
        const match = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/);
        if (!match) continue;
        const [, address, name] = match;
        const info = await this.getDeviceInfo(address);
        devices.push({
          address,
          name: name || address,
          paired: info.paired,
          connected: info.connected,
          rssi: info.rssi,
        });
      }
      return devices;
    } catch {
      return [];
    }
  }

  private async getDeviceInfo(address: string): Promise<{ paired: boolean; connected: boolean; rssi?: number }> {
    try {
      const output = await exec('bluetoothctl', ['info', address], 5000);
      const paired = /Paired:\s*yes/i.test(output);
      const connected = /Connected:\s*yes/i.test(output);
      const rssiMatch = output.match(/RSSI:\s*(-?\d+)/);
      return {
        paired,
        connected,
        rssi: rssiMatch ? parseInt(rssiMatch[1], 10) : undefined,
      };
    } catch {
      return { paired: false, connected: false };
    }
  }

  async pair(address: string, pin = '1234'): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureAgent();
      // Use interactive bluetoothctl to handle PIN prompt
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        let output = '';
        const proc = spawn('bluetoothctl', [], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        proc.stdout!.on('data', (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;
          // Respond to PIN request
          if (/PIN code/i.test(chunk) || /Enter passkey/i.test(chunk)) {
            proc.stdin!.write(`${pin}\n`);
          }
          // Confirm yes/no prompt
          if (/Confirm passkey/i.test(chunk) || /\(yes\/no\)/i.test(chunk)) {
            proc.stdin!.write('yes\n');
          }
        });
        proc.stderr!.on('data', (data: Buffer) => { output += data.toString(); });

        const timeout = setTimeout(() => {
          proc.kill();
          resolve({ success: false, error: 'Pair timeout' });
        }, 20000);

        proc.on('exit', () => {
          clearTimeout(timeout);
          if (/Pairing successful/i.test(output)) {
            resolve({ success: true });
          } else {
            const errLine = output.split('\n').find((l) => /Failed|Error/i.test(l))?.trim();
            resolve({ success: false, error: errLine || 'Pair failed' });
          }
        });

        // Disconnect first (ELM327 may auto-connect before pairing)
        proc.stdin!.write(`disconnect ${address}\n`);
        setTimeout(() => {
          proc.stdin!.write(`pair ${address}\n`);
        }, 1000);
        // Wait for pairing to settle, then trust and quit
        setTimeout(() => {
          proc.stdin!.write(`trust ${address}\n`);
          setTimeout(() => {
            proc.stdin!.write('quit\n');
          }, 2000);
        }, 16000);
      });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('BT pair failed:', msg);
      return { success: false, error: msg };
    }
  }

  async connect(address: string): Promise<{ success: boolean; error?: string }> {
    try {
      await exec('bluetoothctl', ['connect', address], 10000);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('BT connect failed:', msg);
      return { success: false, error: msg };
    }
  }

  async disconnect(address: string): Promise<{ success: boolean; error?: string }> {
    try {
      await exec('bluetoothctl', ['disconnect', address], 5000);
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('BT disconnect failed:', msg);
      return { success: false, error: msg };
    }
  }

  async rfcommBind(btAddress: string, channel = 0): Promise<{ success: boolean; devicePath?: string; error?: string }> {
    const devPath = `/dev/rfcomm${channel}`;
    try {
      // Release existing binding (ignore errors)
      try { execSync(`sudo rfcomm release ${channel}`, { stdio: 'pipe' }); } catch { /* ignore */ }

      // Bind
      execSync(`sudo rfcomm bind ${channel} ${btAddress}`, { stdio: 'pipe' });

      // Wait for device to appear
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(devPath)) break;
        execSync('sleep 0.1');
      }
      if (!fs.existsSync(devPath)) {
        return { success: false, error: `${devPath} not found after rfcomm bind` };
      }

      // chown to current user
      try {
        const uid = process.getuid?.() ?? 1000;
        const gid = process.getgid?.() ?? 1000;
        execSync(`sudo chown ${uid}:${gid} ${devPath}`, { stdio: 'pipe' });
      } catch { /* ignore */ }

      return { success: true, devicePath: devPath };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `rfcomm bind failed: ${msg}` };
    }
  }
}
