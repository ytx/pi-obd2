import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState, StubProfileName } from '@/types';

function SettingsScreen() {
  const { hostname, systemStats, setScreen, setSystemStats } = useAppStore();
  const {
    connectionState,
    isStubMode,
    availablePids,
    currentProfile,
    profiles,
    setConnectionState,
    setStubMode,
    setAvailablePids,
    setProfiles,
    setCurrentProfile,
  } = useOBDStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [stubConfig, setStubConfig] = useState<Record<string, unknown> | null>(null);

  const pollStats = useCallback(() => {
    if (window.obd2API) {
      window.obd2API.getSystemStats().then(setSystemStats);
    }
  }, [setSystemStats]);

  useEffect(() => {
    pollStats();
    intervalRef.current = setInterval(pollStats, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollStats]);

  // Load OBD state on mount
  useEffect(() => {
    if (!window.obd2API) return;
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
    window.obd2API.obdGetAvailablePids().then(setAvailablePids);
    window.obd2API.stubGetProfiles().then(setProfiles);
    window.obd2API.stubGetConfig().then(setStubConfig);
  }, [setStubMode, setConnectionState, setAvailablePids, setProfiles]);

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
    window.obd2API.stubGetConfig().then(setStubConfig);
  };

  const handlePidBaseChange = async (pid: string, base: number) => {
    await window.obd2API.stubSetPidConfig(pid, { pattern: 'random-walk', base, step: 5, min: base * 0.5, max: base * 1.5 });
    window.obd2API.stubGetConfig().then(setStubConfig);
  };

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const stateColor: Record<string, string> = {
    disconnected: 'text-obd-dim',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-obd-danger',
  };

  const pidConfigs = (stubConfig as { pidConfigs?: Record<string, { base?: number; value?: number }> })?.pidConfigs;

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => setScreen('dashboard')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          Back
        </button>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 space-y-6 overflow-auto">
        {/* System Info */}
        <div className="bg-obd-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold text-obd-primary mb-3">System</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-obd-dim">Hostname</span>
            <span>{hostname || '-'}</span>
            {systemStats && (
              <>
                <span className="text-obd-dim">CPU</span>
                <span>{systemStats.cpuUsage}% / {systemStats.cpuTemp}&deg;C</span>
                <span className="text-obd-dim">Memory</span>
                <span>{systemStats.memTotal - systemStats.memFree} / {systemStats.memTotal} MB</span>
                <span className="text-obd-dim">Uptime</span>
                <span>{formatUptime(systemStats.uptime)}</span>
              </>
            )}
          </div>
        </div>

        {/* OBD2 Connection */}
        <div className="bg-obd-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold text-obd-primary mb-3">OBD2 Connection</h2>
          <div className="flex items-center gap-4 mb-3">
            <span className={`font-medium ${stateColor[connectionState] ?? 'text-obd-dim'}`}>
              {connectionState.toUpperCase()}
            </span>
            {isStubMode && (
              <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-1 rounded">STUB MODE</span>
            )}
          </div>
          <div className="flex gap-3">
            {connectionState === 'disconnected' || connectionState === 'error' ? (
              <button
                onClick={handleConnect}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Connect
              </button>
            ) : connectionState === 'connected' ? (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-obd-surface text-obd-warn border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
              >
                Disconnect
              </button>
            ) : (
              <span className="text-yellow-400 text-sm">Connecting...</span>
            )}
          </div>
        </div>

        {/* Stub Mode Settings */}
        {isStubMode && (
          <div className="bg-obd-surface rounded-lg p-4">
            <h2 className="text-lg font-semibold text-obd-primary mb-3">Stub Simulator</h2>

            {/* Profile selection */}
            <div className="mb-4">
              <label className="text-sm text-obd-dim block mb-2">Profile</label>
              <div className="flex gap-2">
                {profiles.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProfileChange(p)}
                    className={`px-3 py-1 rounded text-sm transition-colors ${
                      currentProfile === p
                        ? 'bg-obd-primary text-obd-dark font-bold'
                        : 'bg-obd-dark text-obd-dim border border-obd-dim hover:bg-obd-dim/30'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* PID value sliders */}
            <div className="space-y-3">
              <label className="text-sm text-obd-dim block">PID Base Values</label>
              {availablePids.map((pid) => {
                const cfg = pidConfigs?.[pid.id];
                const currentBase = cfg?.base ?? cfg?.value ?? (pid.min + pid.max) / 2;
                return (
                  <div key={pid.id} className="flex items-center gap-3">
                    <span className="text-xs text-obd-dim w-36 truncate">{pid.name}</span>
                    <input
                      type="range"
                      min={pid.min}
                      max={pid.max}
                      step={(pid.max - pid.min) / 100}
                      value={currentBase}
                      onChange={(e) => handlePidBaseChange(pid.id, parseFloat(e.target.value))}
                      className="flex-1 accent-obd-primary"
                    />
                    <span className="text-xs text-white w-16 text-right">
                      {currentBase.toFixed(1)} {pid.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* WiFi placeholder */}
        <div className="bg-obd-surface rounded-lg p-4 opacity-50">
          <h2 className="text-lg font-semibold text-obd-dim">WiFi (Phase 6)</h2>
        </div>
      </div>

      {/* System Actions */}
      <div className="flex gap-4 mt-6">
        <button
          onClick={() => window.obd2API?.saveConfig()}
          className="flex-1 py-3 bg-obd-surface text-obd-accent border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          Save Config
        </button>
        <button
          onClick={() => window.obd2API?.systemReboot()}
          className="flex-1 py-3 bg-obd-surface text-obd-warn border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          Reboot
        </button>
        <button
          onClick={() => window.obd2API?.systemShutdown()}
          className="flex-1 py-3 bg-obd-surface text-obd-danger border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          Shutdown
        </button>
      </div>
    </div>
  );
}

export default SettingsScreen;
