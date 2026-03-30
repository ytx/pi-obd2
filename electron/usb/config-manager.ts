import fs from 'fs';
import path from 'path';
import { UsbManager } from './usb-manager';
import { logger } from '../logger';

const CONFIG_DIR = 'config';
const CONFIG_PREFIX = 'obd2-config-';
const SETTINGS_PREFIX = 'obd2-settings-';
const STATUS_PREFIX = 'obd2-status-';
const CONFIG_EXT = '.json';
const MAX_GENERATIONS = 20;

// --- Legacy type (v1-v4, read-only) ---

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
  // TPMS (added after v4 type was defined, present in saved files)
  tpms?: {
    sensorAssignments: Record<string, string | null>;
    pressureUnit: string;
    alertThreshold: number;
  };
}

// --- New types (v5 split) ---

export interface OBD2Config {
  version: 5;
  boards: unknown[];
  layouts: Record<string, unknown>;
  destinations: unknown[];
  pidConfig: Record<string, unknown>;
}

export interface OBD2Settings {
  version: 1;
  screenPadding: number;
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
  tpms: {
    sensorAssignments: Record<string, string | null>;
    pressureUnit: string;
    alertThreshold: number;
  };
}

export interface OBD2Status {
  version: 1;
  currentThemeId: string | null;
  currentBoardId: string;
  activeDestinationId: string | null;
  headingUp: boolean;
}

export class ConfigManager {
  constructor(private usbManager: UsbManager) {}

  // ============================================
  // Public read methods
  // ============================================

  readLatestConfig(): OBD2Config | null {
    // Try v5 config files first
    const v5 = this.readLatest<OBD2Config>(CONFIG_PREFIX);
    if (v5 && v5.version === 5) return v5;

    // Fall back to legacy v4 → split
    const legacy = this.readLegacyConfig();
    if (legacy) {
      const { config } = this.splitLegacy(legacy);
      return config;
    }
    return null;
  }

  readLatestSettings(): OBD2Settings | null {
    const s = this.readLatest<OBD2Settings>(SETTINGS_PREFIX);
    if (s) return s;

    // Fall back to legacy v4 → split
    const legacy = this.readLegacyConfig();
    if (legacy) {
      const { settings } = this.splitLegacy(legacy);
      return settings;
    }
    return null;
  }

  readLatestStatus(): OBD2Status | null {
    const s = this.readLatest<OBD2Status>(STATUS_PREFIX);
    if (s) return s;

    // Fall back to legacy v4 → split
    const legacy = this.readLegacyConfig();
    if (legacy) {
      const { status } = this.splitLegacy(legacy);
      return status;
    }
    return null;
  }

  // ============================================
  // Public write methods
  // ============================================

  async writeConfig(config: OBD2Config): Promise<{ success: boolean; error?: string }> {
    return this.writeFile(CONFIG_PREFIX, config, 'config');
  }

  async writeSettingsAndStatus(
    settings: OBD2Settings,
    status: OBD2Status,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.usbManager.isMounted()) {
      return { success: false, error: 'USB not mounted' };
    }
    try {
      await this.usbManager.withWriteAccess(async () => {
        const configDir = this.ensureConfigDir();
        const stamp = this.timestamp();
        this.writeAndPrune(configDir, SETTINGS_PREFIX, stamp, settings, 'settings');
        this.writeAndPrune(configDir, STATUS_PREFIX, stamp, status, 'status');
      });
      return { success: true };
    } catch (err) {
      logger.error('config', `Write settings+status failed: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  // ============================================
  // Private: generic read/write
  // ============================================

  private readLatest<T>(prefix: string): T | null {
    if (!this.usbManager.isMounted()) return null;

    const mountPoint = this.usbManager.getMountPoint();
    const configDir = path.join(mountPoint, CONFIG_DIR);

    if (!fs.existsSync(configDir)) return null;

    const files = this.getFiles(configDir, prefix);
    if (files.length === 0) return null;

    const latest = files[files.length - 1];
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(configDir, latest), 'utf-8'));
      logger.info('config', `Loaded ${latest}`);
      return raw as T;
    } catch (err) {
      logger.error('config', `Failed to read ${latest}: ${err}`);
      return null;
    }
  }

  private async writeFile(
    prefix: string,
    data: unknown,
    label: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.usbManager.isMounted()) {
      return { success: false, error: 'USB not mounted' };
    }
    try {
      await this.usbManager.withWriteAccess(async () => {
        const configDir = this.ensureConfigDir();
        const stamp = this.timestamp();
        this.writeAndPrune(configDir, prefix, stamp, data, label);
      });
      return { success: true };
    } catch (err) {
      logger.error('config', `Write ${label} failed: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  private writeAndPrune(
    configDir: string,
    prefix: string,
    stamp: string,
    data: unknown,
    label: string,
  ): void {
    const fileName = `${prefix}${stamp}${CONFIG_EXT}`;
    const filePath = path.join(configDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('config', `Saved ${fileName}`);
    this.pruneFiles(configDir, prefix);
  }

  // ============================================
  // Private: legacy v1-v4 support
  // ============================================

  private readLegacyConfig(): ConfigV4 | null {
    if (!this.usbManager.isMounted()) return null;

    const mountPoint = this.usbManager.getMountPoint();
    const configDir = path.join(mountPoint, CONFIG_DIR);

    // Try timestamped v4 config files
    if (fs.existsSync(configDir)) {
      const files = this.getFiles(configDir, CONFIG_PREFIX);
      for (let i = files.length - 1; i >= 0; i--) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(configDir, files[i]), 'utf-8'));
          const version = (raw.version as number) || 1;
          if (version <= 4) {
            logger.info('config', `Loaded legacy ${files[i]} (v${version})`);
            return this.migrateLegacy(raw);
          }
        } catch {
          // skip corrupt files
        }
      }
    }

    // Fallback: legacy root-level obd2-config.json
    const legacyPath = path.join(mountPoint, 'obd2-config.json');
    if (fs.existsSync(legacyPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
        logger.info('config', 'Loaded legacy obd2-config.json');
        return this.migrateLegacy(raw);
      } catch (err) {
        logger.error('config', `Failed to read legacy config: ${err}`);
      }
    }

    return null;
  }

  /**
   * Split a legacy ConfigV4 into the 3 new types.
   */
  private splitLegacy(v4: ConfigV4): { config: OBD2Config; settings: OBD2Settings; status: OBD2Status } {
    const config: OBD2Config = {
      version: 5,
      boards: v4.boards,
      layouts: v4.layouts,
      destinations: v4.destinations,
      pidConfig: v4.pidConfig,
    };

    const settings: OBD2Settings = {
      version: 1,
      screenPadding: v4.screenPadding,
      obdDevicePath: v4.obdDevicePath,
      gpsDevicePath: v4.gpsDevicePath,
      gpio: { ...v4.gpio },
      tpms: v4.tpms ?? {
        sensorAssignments: { FL: null, FR: null, RL: null, RR: null },
        pressureUnit: 'kPa',
        alertThreshold: 200,
      },
    };

    const status: OBD2Status = {
      version: 1,
      currentThemeId: v4.currentThemeId,
      currentBoardId: v4.currentBoardId,
      activeDestinationId: v4.activeDestinationId,
      headingUp: v4.headingUp,
    };

    return { config, settings, status };
  }

  /**
   * Migrate older config versions (v1-v3) to v4.
   */
  private migrateLegacy(raw: Record<string, unknown>): ConfigV4 {
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

    if (version >= 3) {
      config.destinations = (raw.destinations as unknown[]) || [];
      config.activeDestinationId = (raw.activeDestinationId as string) ?? null;
    }

    if (version >= 4) {
      if (raw.gpio && typeof raw.gpio === 'object') {
        Object.assign(config.gpio, raw.gpio);
      }
      config.pidConfig = (raw.pidConfig as Record<string, unknown>) || {};
      config.headingUp = (raw.headingUp as boolean) ?? false;
      if (raw.tpms && typeof raw.tpms === 'object') {
        config.tpms = raw.tpms as ConfigV4['tpms'];
      }
    }

    return config;
  }

  // ============================================
  // Private: file helpers
  // ============================================

  private getFiles(configDir: string, prefix: string): string[] {
    try {
      return fs.readdirSync(configDir)
        .filter((f) => f.startsWith(prefix) && f.endsWith(CONFIG_EXT))
        .sort();
    } catch {
      return [];
    }
  }

  private pruneFiles(configDir: string, prefix: string): void {
    const files = this.getFiles(configDir, prefix);
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

  private ensureConfigDir(): string {
    const mountPoint = this.usbManager.getMountPoint();
    const configDir = path.join(mountPoint, CONFIG_DIR);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    return configDir;
  }

  private timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '').replace('T', 'T').slice(0, 15);
  }
}
