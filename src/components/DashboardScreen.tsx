import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState, StubProfileName } from '@/types';

function DashboardScreen() {
  const { hostname, setScreen } = useAppStore();
  const {
    connectionState,
    currentValues,
    isStubMode,
    availablePids,
    currentProfile,
    profiles,
    setConnectionState,
    updateValues,
    setStubMode,
    setAvailablePids,
    setProfiles,
    setCurrentProfile,
  } = useOBDStore();

  // Initialize: load available PIDs, stub mode, profiles, register event listeners
  useEffect(() => {
    if (!window.obd2API) return;

    window.obd2API.obdGetAvailablePids().then(setAvailablePids);
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
    window.obd2API.stubGetProfiles().then(setProfiles);

    const removeData = window.obd2API.onOBDData(updateValues);
    const removeConn = window.obd2API.onOBDConnectionChange((s) =>
      setConnectionState(s as OBDConnectionState),
    );

    return () => {
      removeData();
      removeConn();
    };
  }, [setAvailablePids, setStubMode, setConnectionState, updateValues, setProfiles]);

  const handleConnect = async () => {
    try {
      await window.obd2API.obdConnect();
    } catch (e) {
      console.error('Connect failed:', e);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.obd2API.obdDisconnect();
    } catch (e) {
      console.error('Disconnect failed:', e);
    }
  };

  const handleProfileChange = async (name: string) => {
    await window.obd2API.stubSetProfile(name);
    setCurrentProfile(name as StubProfileName);
  };

  const stateColor: Record<string, string> = {
    disconnected: 'text-obd-dim',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-obd-danger',
  };

  return (
    <div className="h-full flex flex-col bg-obd-dark p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-obd-primary">OBD2 Dashboard</h1>
          <p className="text-sm text-obd-dim">{hostname || 'Unknown Host'}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection state & control */}
          <span className={`text-sm font-medium ${stateColor[connectionState] ?? 'text-obd-dim'}`}>
            {connectionState.toUpperCase()}
          </span>
          {connectionState === 'disconnected' || connectionState === 'error' ? (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
            >
              Connect
            </button>
          ) : connectionState === 'connected' ? (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-obd-surface text-obd-warn border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors text-sm"
            >
              Disconnect
            </button>
          ) : null}
          {isStubMode && (
            <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-1 rounded">STUB</span>
          )}
          <button
            onClick={() => setScreen('settings')}
            className="px-4 py-2 bg-obd-surface text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors text-sm"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Stub profile selector */}
      {isStubMode && connectionState === 'connected' && profiles.length > 0 && (
        <div className="flex gap-2 mb-4">
          {profiles.map((p) => (
            <button
              key={p}
              onClick={() => handleProfileChange(p)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                currentProfile === p
                  ? 'bg-obd-primary text-obd-dark font-bold'
                  : 'bg-obd-surface text-obd-dim border border-obd-dim hover:bg-obd-dim/30'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Data display */}
      <div className="flex-1 overflow-auto">
        {connectionState !== 'connected' ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-obd-accent text-lg">
              {connectionState === 'connecting' ? 'Connecting...' : 'Waiting for connection...'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {availablePids.map((pid) => {
              const val = currentValues[pid.id];
              return (
                <div
                  key={pid.id}
                  className="bg-obd-surface rounded-lg p-3 flex flex-col items-center"
                >
                  <span className="text-xs text-obd-dim mb-1">{pid.name}</span>
                  <span className="text-2xl font-bold text-white">
                    {val ? val.value.toFixed(pid.unit === 'rpm' ? 0 : 1) : '--'}
                  </span>
                  <span className="text-xs text-obd-accent">{pid.unit}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardScreen;
