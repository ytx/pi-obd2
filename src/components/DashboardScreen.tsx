import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { OBDConnectionState, StubProfileName, ThemeData } from '@/types';
import BoardContainer from '@/components/boards/BoardContainer';

// SVG icon components
function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  );
}

function DashboardScreen() {
  const { setScreen } = useAppStore();
  const {
    connectionState,
    isStubMode,
    currentProfile,
    profiles,
    setConnectionState,
    updateValues,
    setStubMode,
    setAvailablePids,
    setProfiles,
    setCurrentProfile,
  } = useOBDStore();

  const { availableThemes, currentThemeId, setAvailableThemes, applyTheme, clearTheme } =
    useThemeStore();

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

  const handleProfileChange = async (name: string) => {
    await window.obd2API.stubSetProfile(name);
    setCurrentProfile(name as StubProfileName);
  };

  const handleThemeChange = async (themeId: string) => {
    if (themeId === '') {
      clearTheme();
      return;
    }
    const data = await window.obd2API.themeLoad(themeId);
    if (data) {
      applyTheme(data as ThemeData);
    }
  };

  const stateColor: Record<string, string> = {
    disconnected: 'text-obd-dim',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-obd-danger',
  };

  // Connection state dot color
  const dotColor: Record<string, string> = {
    disconnected: 'bg-obd-dim',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-green-400',
    error: 'bg-red-500',
  };

  return (
    <div className="h-full flex flex-col bg-obd-dark">
      {/* Header - compact overlay bar */}
      <div className="flex items-center justify-between px-3 py-1">
        <div className="flex items-center gap-3">
          {/* Connection state dot */}
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor[connectionState] ?? 'bg-obd-dim'}`} />
          {/* Stub profile selector */}
          {connectionState === 'connected' && isStubMode && profiles.length > 0 && (
            <div className="flex gap-1">
              {profiles.map((p) => (
                <button
                  key={p}
                  onClick={() => handleProfileChange(p)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    currentProfile === p
                      ? 'bg-obd-primary text-obd-dark font-bold'
                      : 'text-obd-dim hover:bg-obd-dim/30'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {/* Theme selector */}
          {connectionState === 'connected' && availableThemes.length > 0 && (
            <select
              value={currentThemeId ?? ''}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="px-2 py-0.5 rounded text-xs bg-obd-surface text-obd-primary border border-obd-dim"
            >
              <option value="">Default</option>
              {availableThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setScreen('settings')}
          className={`p-1.5 rounded-lg transition-colors hover:bg-obd-dim/30 ${stateColor[connectionState] ?? 'text-obd-dim'}`}
        >
          <GearIcon />
        </button>
      </div>

      {/* Data display */}
      <div className="flex-1 min-h-0">
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
    </div>
  );
}

export default DashboardScreen;
