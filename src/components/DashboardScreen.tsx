import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useGpioStore } from '@/stores/useGpioStore';
import { useGpsStore } from '@/stores/useGpsStore';
import { useTpmsStore } from '@/stores/useTpmsStore';
import { OBDConnectionState, ThemeData, GpioChangeEvent } from '@/types';
import { waitForHydration } from '@/stores/hydration';
import BoardContainer from '@/components/boards/BoardContainer';

function DashboardScreen() {
  const { setScreen } = useAppStore();
  const {
    connectionState,
    isStubMode,
    setConnectionState,
    updateValues,
    setStubMode,
    setAvailablePids,
    setProfiles,
  } = useOBDStore();

  const { setAvailableThemes, applyTheme, clearTheme } = useThemeStore();
  const {
    gpsConnectionState,
    isGpsStubMode,
    setGpsConnectionState,
    setGpsStubMode,
  } = useGpsStore();
  const {
    tpmsConnectionState,
    isTpmsStubMode,
    sensorAssignments,
    alertThreshold,
    setTpmsConnectionState,
    setTpmsStubMode,
  } = useTpmsStore();
  const screenPadding = useBoardStore((s) => s.screenPadding);

  // WiFi & USB state for indicators
  const [wifiConnected, setWifiConnected] = useState(false);
  const [usbState, setUsbState] = useState<string>('unmounted');

  // GPIO saved state refs (for restoring on OFF)
  const savedThemeIdRef = useRef<string | null | undefined>(undefined);
  const savedBoardIdRef = useRef<string | null>(null);

  // Initialize: load available PIDs, stub mode, profiles, themes, register event listeners
  // Then auto-connect after hydration
  useEffect(() => {
    if (!window.obd2API) return;
    let cancelled = false;

    window.obd2API.obdGetAvailablePids().then(setAvailablePids);
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
    window.obd2API.stubGetProfiles().then(setProfiles);
    window.obd2API.themeList().then(setAvailableThemes);

    const removeData = window.obd2API.onOBDData(updateValues);
    const removeConn = window.obd2API.onOBDConnectionChange((s) =>
      setConnectionState(s as OBDConnectionState),
    );

    // GPS listeners
    window.obd2API.gpsIsStubMode().then(setGpsStubMode);
    window.obd2API.gpsGetState().then((s) => setGpsConnectionState(s as OBDConnectionState));
    const removeGpsData = window.obd2API.onGPSData(updateValues);
    const removeGpsConn = window.obd2API.onGPSConnectionChange((s) =>
      setGpsConnectionState(s as OBDConnectionState),
    );

    // TPMS listeners
    window.obd2API.tpmsIsStubMode().then(setTpmsStubMode);
    window.obd2API.tpmsGetState().then((s) => setTpmsConnectionState(s as OBDConnectionState));
    const removeTpmsData = window.obd2API.onTPMSData(updateValues);
    const removeTpmsConn = window.obd2API.onTPMSConnectionChange((s) =>
      setTpmsConnectionState(s as OBDConnectionState),
    );

    // Wait for OBDStore hydration then auto-connect (only if disconnected)
    // cancelled flag prevents duplicate connect from React StrictMode double-mount
    waitForHydration(useOBDStore).then(async () => {
      if (cancelled) return;
      const { obdDevicePath, obdBaudRate } = useOBDStore.getState();
      window.obd2API.logSettings({
        obdDevicePath,
        obdBaudRate,
        currentThemeId: useThemeStore.getState().currentThemeId,
      });
      const currentState = await window.obd2API.obdGetState();
      if (cancelled) return;
      if (currentState === 'disconnected' || currentState === 'error') {
        window.obd2API.obdConnect(obdDevicePath ?? undefined, obdBaudRate).catch((e) =>
          console.warn('Auto-connect failed:', e),
        );
      }
    });

    // GPS auto-connect after hydration
    waitForHydration(useGpsStore).then(async () => {
      if (cancelled) return;
      const { gpsDevicePath } = useGpsStore.getState();
      if (!gpsDevicePath) return;
      const currentGpsState = await window.obd2API.gpsGetState();
      if (cancelled) return;
      if (currentGpsState === 'disconnected' || currentGpsState === 'error') {
        window.obd2API.gpsConnect(gpsDevicePath).catch((e) =>
          console.warn('GPS auto-connect failed:', e),
        );
      }
    });

    // TPMS auto-connect after hydration (if any sensors are assigned)
    waitForHydration(useTpmsStore).then(async () => {
      if (cancelled) return;
      const { sensorAssignments } = useTpmsStore.getState();
      const hasAssignments = Object.values(sensorAssignments).some((v) => v !== null);
      if (!hasAssignments) return;
      const currentTpmsState = await window.obd2API.tpmsGetState();
      if (cancelled) return;
      if (currentTpmsState === 'disconnected' || currentTpmsState === 'error') {
        // Restore assignments to main process
        const ts = useTpmsStore.getState().sensorAssignments;
        window.obd2API.tpmsConnect().then(() => {
          // After connect, set saved assignments
          for (const [pos, sensorId] of Object.entries(ts)) {
            if (sensorId) {
              window.obd2API.tpmsAssignSensor(sensorId, pos);
            }
          }
        }).catch((e) =>
          console.warn('TPMS auto-connect failed:', e),
        );
      }
    });

    return () => {
      cancelled = true;
      removeData();
      removeConn();
      removeGpsData();
      removeGpsConn();
      removeTpmsData();
      removeTpmsConn();
    };
  }, [setAvailablePids, setStubMode, setConnectionState, updateValues, setProfiles, setAvailableThemes, setGpsConnectionState, setGpsStubMode, setTpmsConnectionState, setTpmsStubMode]);

  // Poll WiFi state, listen for USB state changes
  useEffect(() => {
    if (!window.obd2API) return;
    // WiFi: poll
    const poll = () => {
      window.obd2API.wifiGetCurrent().then((ssid) => setWifiConnected(ssid !== null)).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    // USB: get initial + listen
    window.obd2API.usbGetState().then((s) => setUsbState(s.state)).catch(() => {});
    const cleanupUsb = window.obd2API.onUsbStateChange((state) => setUsbState(state));
    return () => { clearInterval(id); cleanupUsb(); };
  }, []);

  // GPIO change listener — illumination (theme switch) and reverse (board switch)
  useEffect(() => {
    if (!window.obd2API?.onGpioChange) return;

    // Setup GPIO pins after hydration
    waitForHydration(useGpioStore).then(() => {
      const { illuminationPin, reversePin, usbResetPin } = useGpioStore.getState();
      const pins: number[] = [];
      if (illuminationPin !== null) pins.push(illuminationPin);
      if (reversePin !== null) pins.push(reversePin);
      if (pins.length > 0) {
        window.obd2API.gpioSetup(pins);
      }
      // Register USB reset pin with main process (for auto-reset on ELM327 error)
      window.obd2API.gpioSetUsbResetPin(usbResetPin);
      // Initialize USB reset pin to HIGH (output pin, not monitored by gpiomon)
      if (usbResetPin !== null) {
        window.obd2API.gpioSet(usbResetPin, 1);
      }
    });

    const removeGpio = window.obd2API.onGpioChange(async (event: GpioChangeEvent) => {
      const gpioState = useGpioStore.getState();
      const { illuminationPin, reversePin, illuminationThemeId, reverseBoardId,
              illuminationActiveHigh, reverseActiveHigh } = gpioState;

      // Illumination
      if (event.pin === illuminationPin) {
        const isOn = illuminationActiveHigh ? event.value === 1 : event.value === 0;
        if (isOn && illuminationThemeId) {
          // ON — save current theme and switch
          savedThemeIdRef.current = useThemeStore.getState().currentThemeId;
          useGpioStore.getState().setIlluminationActive(true);
          try {
            const data = await window.obd2API.themeLoad(illuminationThemeId);
            if (data) applyTheme(data as ThemeData);
          } catch (e) {
            console.warn('GPIO illumination theme load failed:', e);
          }
        } else if (!isOn) {
          // OFF — restore saved theme
          useGpioStore.getState().setIlluminationActive(false);
          const saved = savedThemeIdRef.current;
          savedThemeIdRef.current = undefined;
          if (saved) {
            try {
              const data = await window.obd2API.themeLoad(saved);
              if (data) applyTheme(data as ThemeData);
            } catch (e) {
              console.warn('GPIO illumination theme restore failed:', e);
            }
          } else {
            clearTheme();
          }
        }
      }

      // Reverse
      if (event.pin === reversePin) {
        const isOn = reverseActiveHigh ? event.value === 1 : event.value === 0;
        if (isOn && reverseBoardId) {
          // ON — save current board and switch
          savedBoardIdRef.current = useBoardStore.getState().currentBoardId;
          useGpioStore.getState().setReverseActive(true);
          useBoardStore.getState().setCurrentBoardId(reverseBoardId);
        } else if (!isOn) {
          // OFF — restore saved board
          useGpioStore.getState().setReverseActive(false);
          const saved = savedBoardIdRef.current;
          savedBoardIdRef.current = null;
          if (saved) {
            useBoardStore.getState().setCurrentBoardId(saved);
          }
        }
      }
    });

    return () => {
      removeGpio();
    };
  }, [applyTheme, clearTheme]);

  // Connection indicator colors
  const getIconColor = (state: OBDConnectionState, stub: boolean): string => {
    if (state === 'connected' && stub) return 'text-gray-400';
    if (state === 'connected') return 'text-green-400';
    if (state === 'connecting') return 'text-yellow-400 animate-pulse';
    if (state === 'error') return 'text-red-500';
    return 'text-red-500';
  };

  const obdColor = getIconColor(connectionState, isStubMode);
  const gpsColor = getIconColor(gpsConnectionState, isGpsStubMode);
  const tpmsColor = getIconColor(tpmsConnectionState, isTpmsStubMode);

  // Check if any TPMS tire is below alert threshold
  const currentValues = useOBDStore((s) => s.currentValues);
  const tpmsAlert = tpmsConnectionState === 'connected' && (['FL', 'FR', 'RL', 'RR'] as const).some((pos) => {
    const p = currentValues[`TPMS_${pos}_P`]?.value;
    return p !== undefined && sensorAssignments[pos] !== null && p < alertThreshold;
  });

  const anyConnected = connectionState === 'connected' || gpsConnectionState === 'connected' || tpmsConnectionState === 'connected';

  return (
    <div className="h-full relative bg-obd-dark">
      {/* Full-screen board area */}
      <div className="h-full" style={{ padding: screenPadding }}>
        {!anyConnected ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-obd-accent text-lg">
              {connectionState === 'connecting' || gpsConnectionState === 'connecting'
                ? 'Connecting...' : 'Waiting for connection...'}
            </p>
          </div>
        ) : (
          <BoardContainer />
        )}
      </div>

      {/* Status icons overlay - top-right */}
      <div className="absolute top-2 right-2 pointer-events-none flex flex-col gap-1">
        <span className={`material-symbols-outlined text-base ${usbState === 'unmounted' ? 'text-red-500' : usbState === 'rw' ? 'text-yellow-400' : 'text-green-400'}`}>usb</span>
        <span className={`material-symbols-outlined text-base ${wifiConnected ? 'text-green-400' : 'text-red-500'}`}>wifi</span>
        <span className={`material-symbols-outlined text-base ${gpsColor}`}>satellite_alt</span>
        <span className={`material-symbols-outlined text-base ${obdColor}`}>directions_car</span>
        <span className={`material-symbols-outlined text-base ${tpmsAlert ? 'text-red-500 animate-pulse' : tpmsColor}`}>tire_repair</span>
      </div>

      {/* Tap zone - top-left: Menu */}
      <div
        className="absolute top-0 left-0 w-[100px] h-[100px] cursor-pointer z-50"
        onClick={() => setScreen('menu')}
      />
    </div>
  );
}

export default DashboardScreen;
