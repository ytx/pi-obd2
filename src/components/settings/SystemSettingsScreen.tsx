import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState } from '@/types';
import BluetoothSection from '@/components/settings/BluetoothSection';
import WiFiSection from '@/components/settings/WiFiSection';

function SystemSettingsScreen() {
  const { hostname, systemStats, setScreen, setSystemStats } = useAppStore();
  const {
    connectionState,
    isStubMode,
    setConnectionState,
    setStubMode,
  } = useOBDStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!window.obd2API) return;
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
  }, [setStubMode, setConnectionState]);

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

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('dashboard')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
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

        {/* Bluetooth */}
        <BluetoothSection />

        {/* WiFi */}
        <WiFiSection />

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
      </div>

      {/* System Actions */}
      <div className="flex gap-4 mt-4">
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

export default SystemSettingsScreen;
