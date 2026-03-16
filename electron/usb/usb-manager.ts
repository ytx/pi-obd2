import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from '../logger';

export type UsbState = 'unmounted' | 'ro' | 'rw';

const MOUNT_POINT = '/mnt/obd2-usb';
const TMP_MOUNT = '/tmp/obd2-usb-check';

export class UsbManager {
  private state: UsbState = 'unmounted';
  private device: string | null = null;
  private rwRefCount = 0;
  private rwMutex: Promise<void> = Promise.resolve();
  private stateCallbacks: ((state: UsbState) => void)[] = [];

  getMountPoint(): string {
    return MOUNT_POINT;
  }

  getState(): UsbState {
    return this.state;
  }

  getDevice(): string | null {
    return this.device;
  }

  isMounted(): boolean {
    return this.state !== 'unmounted';
  }

  onChange(cb: (state: UsbState) => void): void {
    this.stateCallbacks.push(cb);
  }

  /**
   * Auto-detect USB with `config/` folder and mount ro.
   * Also accepts legacy USB with root-level `obd2-config.json`.
   */
  autoDetectAndMount(): boolean {
    // Already mounted?
    if (this.checkAlreadyMounted()) return true;

    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const parts = this.getUsbPartitions();

    for (const part of parts) {
      if (part.mountpoint) continue; // skip already-mounted partitions

      try {
        execSync(`sudo mkdir -p ${TMP_MOUNT}`, { stdio: 'pipe' });
        execSync(`sudo mount -t vfat -o ro,uid=${uid},gid=${gid} ${part.device} ${TMP_MOUNT}`, { stdio: 'pipe' });

        const hasConfig = fs.existsSync(path.join(TMP_MOUNT, 'config'));
        const hasLegacyConfig = fs.existsSync(path.join(TMP_MOUNT, 'obd2-config.json'));

        execSync(`sudo umount ${TMP_MOUNT}`, { stdio: 'pipe' });

        if (hasConfig || hasLegacyConfig) {
          // Mount at the real mount point
          execSync(`sudo mkdir -p ${MOUNT_POINT}`, { stdio: 'pipe' });
          execSync(`sudo mount -t vfat -o ro,uid=${uid},gid=${gid} ${part.device} ${MOUNT_POINT}`, { stdio: 'pipe' });
          this.device = part.device;
          this.setState('ro');
          logger.info('usb', `Mounted ${part.device} at ${MOUNT_POINT} (ro)`);
          return true;
        }
      } catch (err) {
        try { execSync(`sudo umount ${TMP_MOUNT}`, { stdio: 'pipe' }); } catch { /* ignore */ }
        logger.error('usb', `Check ${part.device} failed: ${err}`);
      }
    }

    logger.info('usb', 'No USB with config/ folder found');
    return false;
  }

  /**
   * Wrap a short write operation: remount rw → fn() → remount ro.
   * Serialized via mutex. RefCount prevents premature ro remount
   * when multiple writers overlap (e.g. capture + log save).
   */
  async withWriteAccess<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireWrite();
    try {
      return await fn();
    } finally {
      await this.releaseWrite();
    }
  }

  /**
   * Acquire rw access (for long-running operations like capture).
   * Increments refcount; remounts rw on 0→1 transition.
   */
  async acquireWrite(): Promise<void> {
    if (!this.isMounted()) throw new Error('USB not mounted');

    // Serialize remount operations
    const prev = this.rwMutex;
    let resolve!: () => void;
    this.rwMutex = new Promise<void>((r) => { resolve = r; });

    await prev;

    try {
      this.rwRefCount++;
      if (this.rwRefCount === 1) {
        // Transition ro → rw
        execSync(`sudo mount -o remount,rw ${MOUNT_POINT}`, { stdio: 'pipe' });
        this.setState('rw');
        logger.info('usb', 'Remounted rw');
      }
    } finally {
      resolve();
    }
  }

  /**
   * Release rw access. Decrements refcount; remounts ro on 1→0 transition.
   */
  async releaseWrite(): Promise<void> {
    const prev = this.rwMutex;
    let resolve!: () => void;
    this.rwMutex = new Promise<void>((r) => { resolve = r; });

    await prev;

    try {
      if (this.rwRefCount > 0) this.rwRefCount--;
      if (this.rwRefCount === 0 && this.state === 'rw') {
        execSync(`sudo mount -o remount,ro ${MOUNT_POINT}`, { stdio: 'pipe' });
        this.setState('ro');
        logger.info('usb', 'Remounted ro');
      }
    } catch (err) {
      logger.error('usb', `Remount ro failed: ${err}`);
    } finally {
      resolve();
    }
  }

  // --- Internal ---

  private setState(state: UsbState): void {
    if (this.state === state) return;
    this.state = state;
    for (const cb of this.stateCallbacks) {
      try { cb(state); } catch { /* ignore */ }
    }
  }

  private checkAlreadyMounted(): boolean {
    try {
      execSync(`mountpoint -q ${MOUNT_POINT}`, { stdio: 'pipe' });
      // Detect device
      try {
        this.device = execSync(`findmnt -n -o SOURCE ${MOUNT_POINT}`, { encoding: 'utf-8' }).trim() || null;
      } catch { /* ignore */ }
      // Check if ro or rw
      try {
        const opts = execSync(`findmnt -n -o OPTIONS ${MOUNT_POINT}`, { encoding: 'utf-8' }).trim();
        this.setState(opts.includes('ro') ? 'ro' : 'rw');
      } catch {
        this.setState('ro');
      }
      logger.info('usb', `Already mounted at ${MOUNT_POINT} (${this.state})`);
      return true;
    } catch {
      return false;
    }
  }

  private getUsbPartitions(): { device: string; mountpoint: string | null }[] {
    try {
      const output = execSync('lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,TRAN,RM', { encoding: 'utf-8' });
      const data = JSON.parse(output);
      const parts: { device: string; mountpoint: string | null }[] = [];
      for (const dev of data.blockdevices) {
        if (dev.tran === 'usb' && dev.rm && dev.children) {
          for (const part of dev.children) {
            if (part.type === 'part') {
              parts.push({ device: `/dev/${part.name}`, mountpoint: part.mountpoint || null });
            }
          }
        }
      }
      return parts;
    } catch {
      return [];
    }
  }
}
