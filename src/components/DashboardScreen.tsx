import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { OBDConnectionState } from '@/types';
import BoardContainer from '@/components/boards/BoardContainer';

function DashboardScreen() {
  const { setScreen } = useAppStore();
  const {
    connectionState,
    setConnectionState,
    updateValues,
    setStubMode,
    setAvailablePids,
    setProfiles,
  } = useOBDStore();

  const { setAvailableThemes } = useThemeStore();
  const screenPadding = useBoardStore((s) => s.screenPadding);

  // Initialize: load available PIDs, stub mode, profiles, themes, register event listeners
  // Then auto-connect
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

    // Auto-connect
    window.obd2API.obdConnect().catch((e) => console.warn('Auto-connect failed:', e));

    return () => {
      removeData();
      removeConn();
    };
  }, [setAvailablePids, setStubMode, setConnectionState, updateValues, setProfiles, setAvailableThemes]);

  // Connection state dot color
  const dotColor: Record<string, string> = {
    disconnected: 'bg-obd-dim',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-green-400',
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
