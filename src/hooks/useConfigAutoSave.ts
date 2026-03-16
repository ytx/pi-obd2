import { useEffect, useRef } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useGpsStore } from '@/stores/useGpsStore';
import { useGpioStore } from '@/stores/useGpioStore';
import { usePidConfigStore } from '@/stores/usePidConfigStore';
import { useMapStore } from '@/stores/useMapStore';
import { useTpmsStore } from '@/stores/useTpmsStore';

const DEBOUNCE_MS = 5000;

/**
 * Collect all persisted store state into a ConfigV4 object and save to USB.
 * Subscribes to all 7 Zustand stores; debounces writes with 5s delay.
 */
export function useConfigAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the first trigger (initial hydration values)
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!window.obd2API) return;

    function scheduleAutoSave() {
      // Don't save on initial mount — only on subsequent changes
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const board = useBoardStore.getState();
        const theme = useThemeStore.getState();
        const obd = useOBDStore.getState();
        const gps = useGpsStore.getState();
        const gpio = useGpioStore.getState();
        const pid = usePidConfigStore.getState();
        const map = useMapStore.getState();
        const tpms = useTpmsStore.getState();

        const config = {
          version: 4,
          boards: board.boards,
          layouts: board.layouts,
          currentBoardId: board.currentBoardId,
          screenPadding: board.screenPadding,
          currentThemeId: theme.currentThemeId,
          obdDevicePath: obd.obdDevicePath,
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
          pidConfig: pid.configs,
          destinations: map.destinations,
          activeDestinationId: map.activeDestinationId,
          headingUp: map.headingUp,
          tpms: {
            sensorAssignments: tpms.sensorAssignments,
            pressureUnit: tpms.pressureUnit,
            alertThreshold: tpms.alertThreshold,
          },
        };

        window.obd2API.configSave(config).catch(() => {
          // Silently ignore — USB may not be mounted
        });
      }, DEBOUNCE_MS);
    }

    // Subscribe to all stores
    const unsubs = [
      useBoardStore.subscribe(scheduleAutoSave),
      useThemeStore.subscribe(scheduleAutoSave),
      useOBDStore.subscribe(scheduleAutoSave),
      useGpsStore.subscribe(scheduleAutoSave),
      useGpioStore.subscribe(scheduleAutoSave),
      usePidConfigStore.subscribe(scheduleAutoSave),
      useMapStore.subscribe(scheduleAutoSave),
      useTpmsStore.subscribe(scheduleAutoSave),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
