import { execFile, spawn, ChildProcess } from 'child_process';

interface BTDevice {
  address: string;
  name: string;
  paired: boolean;
  connected: boolean;
  rssi?: number;
}

function exec(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export class BluetoothManager {
  private scanning = false;
  private agentReady = false;

  async ensureAgent(): Promise<void> {
    if (this.agentReady) return;
    try {
      await exec('bluetoothctl', ['agent', 'NoInputNoOutput']);
      await exec('bluetoothctl', ['default-agent']);
      this.agentReady = true;
    } catch {
      // Agent may already be registered — not fatal
    }
  }

  async scan(durationMs = 8000): Promise<BTDevice[]> {
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

  async pair(address: string): Promise<boolean> {
    try {
      await this.ensureAgent();
      await exec('bluetoothctl', ['pair', address], 15000);
      // Trust the device so it auto-connects in the future
      try { await exec('bluetoothctl', ['trust', address], 5000); } catch { /* ignore */ }
      return true;
    } catch (e) {
      console.error('BT pair failed:', e);
      return false;
    }
  }

  async connect(address: string): Promise<boolean> {
    try {
      await exec('bluetoothctl', ['connect', address], 10000);
      return true;
    } catch (e) {
      console.error('BT connect failed:', e);
      return false;
    }
  }

  async disconnect(address: string): Promise<boolean> {
    try {
      await exec('bluetoothctl', ['disconnect', address], 5000);
      return true;
    } catch (e) {
      console.error('BT disconnect failed:', e);
      return false;
    }
  }
}
