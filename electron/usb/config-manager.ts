import fs from 'fs';
import path from 'path';
import { UsbManager } from './usb-manager';
import { logger } from '../logger';

const CONFIG_DIR = 'config';
const CONFIG_PREFIX = 'obd2-config-';
const CONFIG_EXT = '.json';
const MAX_GENERATIONS = 20;

export interface ConfigV4 {
  version: 4;
  boards: unknown[];
  layouts: Record<string, unknown>;
  currentBoardId: string;
  screenPadding: number;
  currentThemeId: string | null;
  obdDevicePath: string | null;
  gpsDevicePath: string | null;
  gpio: {
    illuminationPin: number | null;
    reversePin: number | null;
    illuminationActiveHigh: boolean;
    reverseActiveHigh: boolean;
    illuminationThemeId: string | null;
    reverseBoardId: string | null;
    usbResetPin: number | null;
  };
  pidConfig: Record<string, unknown>;
  destinations: unknown[];
  activeDestinationId: string | null;
  headingUp: boolean;
}

export class ConfigManager {
  constructor(private usbManager: UsbManager) {}

  /**
   * Read the latest config from USB config/ directory.
   * Falls back to legacy root-level obd2-config.json.
   */
  readLatestConfig(): ConfigV4 | null {
    if (!this.usbManager.isMounted()) return null;

    const mountPoint = this.usbManager.getMountPoint();
    const configDir = path.join(mountPoint, CONFIG_DIR);

    // Try timestamped configs in config/ dir
    if (fs.existsSync(configDir)) {
      const files = this.getConfigFiles(configDir);
      if (files.length > 0) {
        const latest = files[files.length - 1]; // sorted ascending, last = newest
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(configDir, latest), 'utf-8'));
          logger.info('config', `Loaded ${latest}`);
          return this.migrate(raw);
        } catch (err) {
          logger.error('config', `Failed to read ${latest}: ${err}`);
        }
      }
    }

    // Fallback: legacy root-level obd2-config.json
    const legacyPath = path.join(mountPoint, 'obd2-config.json');
    if (fs.existsSync(legacyPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
        logger.info('config', 'Loaded legacy obd2-config.json');
        return this.migrate(raw);
      } catch (err) {
        logger.error('config', `Failed to read legacy config: ${err}`);
      }
    }

    return null;
  }

  /**
   * Write config to USB with timestamped filename.
   * Uses withWriteAccess for rw remount.
   * Prunes to MAX_GENERATIONS files.
   */
  async writeConfig(config: ConfigV4): Promise<{ success: boolean; error?: string }> {
    if (!this.usbManager.isMounted()) {
      return { success: false, error: 'USB not mounted' };
    }

    try {
      await this.usbManager.withWriteAccess(async () => {
        const mountPoint = this.usbManager.getMountPoint();
        const configDir = path.join(mountPoint, CONFIG_DIR);

        // Ensure config/ directory exists
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }

        // Write with timestamp
        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, '').replace('T', 'T').slice(0, 15);
        const fileName = `${CONFIG_PREFIX}${stamp}${CONFIG_EXT}`;
        const filePath = path.join(configDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
        logger.info('config', `Saved ${fileName}`);

        // Prune old files
        this.pruneOldConfigs(configDir);
      });
      return { success: true };
    } catch (err) {
      logger.error('config', `Write failed: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Migrate older config versions to v4.
   */
  private migrate(raw: Record<string, unknown>): ConfigV4 {
    const version = (raw.version as number) || 1;

    const config: ConfigV4 = {
      version: 4,
      boards: (raw.boards as unknown[]) || [],
      layouts: (raw.layouts as Record<string, unknown>) || {},
      currentBoardId: (raw.currentBoardId as string) || '',
      screenPadding: (raw.screenPadding as number) ?? 0,
      currentThemeId: (raw.currentThemeId as string) ?? null,
      obdDevicePath: (raw.obdDevicePath as string) ?? null,
      gpsDevicePath: (raw.gpsDevicePath as string) ?? null,
      gpio: {
        illuminationPin: null,
        reversePin: null,
        illuminationActiveHigh: true,
        reverseActiveHigh: true,
        illuminationThemeId: null,
        reverseBoardId: null,
        usbResetPin: null,
      },
      pidConfig: {},
      destinations: [],
      activeDestinationId: null,
      headingUp: false,
    };

    // v3+: destinations
    if (version >= 3) {
      config.destinations = (raw.destinations as unknown[]) || [];
      config.activeDestinationId = (raw.activeDestinationId as string) ?? null;
    }

    // v4: additional fields
    if (version >= 4) {
      if (raw.gpio && typeof raw.gpio === 'object') {
        Object.assign(config.gpio, raw.gpio);
      }
      config.pidConfig = (raw.pidConfig as Record<string, unknown>) || {};
      config.headingUp = (raw.headingUp as boolean) ?? false;
    }

    return config;
  }

  /**
   * Get sorted config file names (ascending by timestamp).
   */
  private getConfigFiles(configDir: string): string[] {
    try {
      return fs.readdirSync(configDir)
        .filter((f) => f.startsWith(CONFIG_PREFIX) && f.endsWith(CONFIG_EXT))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Remove oldest config files, keeping at most MAX_GENERATIONS.
   */
  private pruneOldConfigs(configDir: string): void {
    const files = this.getConfigFiles(configDir);
    if (files.length <= MAX_GENERATIONS) return;

    const toDelete = files.slice(0, files.length - MAX_GENERATIONS);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(configDir, f));
        logger.info('config', `Pruned ${f}`);
      } catch (err) {
        logger.warn('config', `Failed to prune ${f}: ${err}`);
      }
    }
  }
}
