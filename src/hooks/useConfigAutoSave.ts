import { useEffect, useRef } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useGpsStore } from '@/stores/useGpsStore';
import { useGpioStore } from '@/stores/useGpioStore';
import { usePidConfigStore } from '@/stores/usePidConfigStore';
import { useMapStore } from '@/stores/useMapStore';
import { useTpmsStore } from '@/stores/useTpmsStore';

const CONFIG_DEBOUNCE_MS = 5000;
const SETTINGS_STATUS_DEBOUNCE_MS = 30000;

/**
 * Auto-save config/settings/status to USB on store changes.
 *
 * - config (5s debounce): boards, layouts, destinations, pidConfig
 * - settings + status (30s debounce): device paths, GPIO, TPMS, theme, currentBoard, etc.
 *
 * Settings and status are saved together in one IPC call to minimize USB rw remount cycles.
 */
export function useConfigAutoSave(): void {
  const configTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!window.obd2API) return;

    function saveConfig() {
      const board = useBoardStore.getState();
      const pid = usePidConfigStore.getState();
      const map = useMapStore.getState();

      const config = {
        version: 5,
        boards: board.boards,
        layouts: board.layouts,
        destinations: map.destinations,
        pidConfig: pid.configs,
      };

      window.obd2API.configSave(config).catch(() => {});
    }

    function saveSettingsAndStatus() {
      const board = useBoardStore.getState();
      const theme = useThemeStore.getState();
      const obd = useOBDStore.getState();
      const gps = useGpsStore.getState();
      const gpio = useGpioStore.getState();
      const map = useMapStore.getState();
      const tpms = useTpmsStore.getState();

      const settings = {
        version: 1,
        screenPadding: board.screenPadding,
        obdDevicePath: obd.obdDevicePath,
        obdBaudRate: obd.obdBaudRate,
        gpsDevicePath: gps.gpsDevicePath,
        gpio: {
          illuminationPin: gpio.illuminationPin,
          reversePin: gpio.reversePin,
          illuminationActiveHigh: gpio.illuminationActiveHigh,
          reverseActiveHigh: gpio.reverseActiveHigh,
          illuminationThemeId: gpio.illuminationThemeId,
          reverseBoardId: gpio.reverseBoardId,
          usbResetPin: gpio.usbResetPin,
        },
        tpms: {
          sensorAssignments: tpms.sensorAssignments,
          pressureUnit: tpms.pressureUnit,
          alertThreshold: tpms.alertThreshold,
        },
      };

      const status = {
        version: 1,
        currentThemeId: theme.currentThemeId,
        currentBoardId: board.currentBoardId,
        activeDestinationId: map.activeDestinationId,
        headingUp: map.headingUp,
      };

      window.obd2API.settingsStatusSave(settings, status).catch(() => {});
    }

    function scheduleConfig() {
      if (!initializedRef.current) return;
      if (configTimerRef.current) clearTimeout(configTimerRef.current);
      configTimerRef.current = setTimeout(saveConfig, CONFIG_DEBOUNCE_MS);
    }

    function scheduleSettingsStatus() {
      if (!initializedRef.current) return;
      if (settingsStatusTimerRef.current) clearTimeout(settingsStatusTimerRef.current);
      settingsStatusTimerRef.current = setTimeout(saveSettingsAndStatus, SETTINGS_STATUS_DEBOUNCE_MS);
    }

    function scheduleBoth() {
      scheduleConfig();
      scheduleSettingsStatus();
    }

    // Skip the very first trigger from each store (initial hydration)
    // We count total first-triggers; once all 8 stores have fired, we're initialized
    let initCount = 0;
    const STORE_COUNT = 8;
    function maybeInit() {
      initCount++;
      if (initCount >= STORE_COUNT) {
        initializedRef.current = true;
      }
    }

    // Subscribe to stores, routing changes to the appropriate timer
    // useBoardStore: boards/layouts → config, screenPadding → settings, currentBoardId → status
    // useMapStore: destinations → config, activeDestinationId/headingUp → status
    // These stores straddle categories, so trigger both timers
    const unsubs = [
      useBoardStore.subscribe(() => { maybeInit(); scheduleBoth(); }),
      usePidConfigStore.subscribe(() => { maybeInit(); scheduleConfig(); }),
      useMapStore.subscribe(() => { maybeInit(); scheduleBoth(); }),
      useThemeStore.subscribe(() => { maybeInit(); scheduleSettingsStatus(); }),
      useOBDStore.subscribe(() => { maybeInit(); scheduleSettingsStatus(); }),
      useGpsStore.subscribe(() => { maybeInit(); scheduleSettingsStatus(); }),
      useGpioStore.subscribe(() => { maybeInit(); scheduleSettingsStatus(); }),
      useTpmsStore.subscribe(() => { maybeInit(); scheduleSettingsStatus(); }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
      if (configTimerRef.current) clearTimeout(configTimerRef.current);
      if (settingsStatusTimerRef.current) clearTimeout(settingsStatusTimerRef.current);
    };
  }, []);
}
