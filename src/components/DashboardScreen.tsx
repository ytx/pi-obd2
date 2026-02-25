import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useGpioStore } from '@/stores/useGpioStore';
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
  const screenPadding = useBoardStore((s) => s.screenPadding);

  // GPIO saved state refs (for restoring on OFF)
  const savedThemeIdRef = useRef<string | null | undefined>(undefined);
  const savedBoardIdRef = useRef<string | null>(null);

  // Initialize: load available PIDs, stub mode, profiles, themes, register event listeners
  // Then auto-connect after hydration
  useEffect(() => {
    if (!window.obd2API) return;

    window.obd2API.obdGetAvailablePids().then(setAvailablePids);
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
    window.obd2API.stubGetProfiles().then(setProfiles);
    window.obd2API.themeList().then(setAvailableThemes);

    const removeData = window.obd2API.onOBDData(updateValues);
    const removeConn = window.obd2API.onOBDConnectionChange((s) =>
      setConnectionState(s as OBDConnectionState),
    );

    // Wait for OBDStore hydration then auto-connect (only if disconnected)
    waitForHydration(useOBDStore).then(async () => {
      const { obdBtAddress } = useOBDStore.getState();
      window.obd2API.logSettings({
        obdBtAddress,
        currentThemeId: useThemeStore.getState().currentThemeId,
      });
      const currentState = await window.obd2API.obdGetState();
      if (currentState === 'disconnected' || currentState === 'error') {
        window.obd2API.obdConnect(obdBtAddress ?? undefined).catch((e) =>
          console.warn('Auto-connect failed:', e),
        );
      }
    });

    return () => {
      removeData();
      removeConn();
    };
  }, [setAvailablePids, setStubMode, setConnectionState, updateValues, setProfiles, setAvailableThemes]);

  // GPIO change listener — illumination (theme switch) and reverse (board switch)
  useEffect(() => {
    if (!window.obd2API?.onGpioChange) return;

    // Setup GPIO pins after hydration
    waitForHydration(useGpioStore).then(() => {
      const { illuminationPin, reversePin } = useGpioStore.getState();
      const pins: number[] = [];
      if (illuminationPin !== null) pins.push(illuminationPin);
      if (reversePin !== null) pins.push(reversePin);
      if (pins.length > 0) {
        window.obd2API.gpioSetup(pins);
      }
    });

    const removeGpio = window.obd2API.onGpioChange(async (event: GpioChangeEvent) => {
      const gpioState = useGpioStore.getState();
      const { illuminationPin, reversePin, illuminationThemeId, reverseBoardId } = gpioState;

      // Illumination
      if (event.pin === illuminationPin) {
        if (event.value === 1 && illuminationThemeId) {
          // ON — save current theme and switch
          savedThemeIdRef.current = useThemeStore.getState().currentThemeId;
          useGpioStore.getState().setIlluminationActive(true);
          try {
            const data = await window.obd2API.themeLoad(illuminationThemeId);
            if (data) applyTheme(data as ThemeData);
          } catch (e) {
            console.warn('GPIO illumination theme load failed:', e);
          }
        } else if (event.value === 0) {
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
        if (event.value === 1 && reverseBoardId) {
          // ON — save current board and switch
          savedBoardIdRef.current = useBoardStore.getState().currentBoardId;
          useGpioStore.getState().setReverseActive(true);
          useBoardStore.getState().setCurrentBoardId(reverseBoardId);
        } else if (event.value === 0) {
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

  // Connection state dot color (yellow for stub mode)
  const dotColor: Record<string, string> = {
    disconnected: 'bg-obd-dim',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: isStubMode ? 'bg-yellow-400' : 'bg-green-400',
    error: 'bg-red-500',
  };

  return (
    <div className="h-full relative bg-obd-dark">
      {/* Full-screen board area */}
      <div className="h-full" style={{ padding: screenPadding }}>
        {connectionState !== 'connected' ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-obd-accent text-lg">
              {connectionState === 'connecting' ? 'Connecting...' : 'Waiting for connection...'}
            </p>
          </div>
        ) : (
          <BoardContainer />
        )}
      </div>

      {/* Connection state dot overlay - top-right */}
      <div className="absolute top-3 right-3 pointer-events-none">
        <span className={`block w-3 h-3 rounded-full ${dotColor[connectionState] ?? 'bg-obd-dim'}`} />
      </div>

      {/* Tap zones - transparent, absolute positioned */}
      {/* Top-right: System Settings */}
      <div
        className="absolute top-0 right-0 w-[100px] h-[100px] cursor-pointer"
        onClick={() => setScreen('system-settings')}
      />
      {/* Bottom-right: Display Settings */}
      <div
        className="absolute bottom-0 right-0 w-[100px] h-[100px] cursor-pointer"
        onClick={() => setScreen('display-settings')}
      />
      {/* Bottom-left: Dev Settings */}
      <div
        className="absolute bottom-0 left-0 w-[100px] h-[100px] cursor-pointer"
        onClick={() => setScreen('dev-settings')}
      />
    </div>
  );
}

export default DashboardScreen;
