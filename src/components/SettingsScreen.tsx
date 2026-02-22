import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';

function SettingsScreen() {
  const { hostname, systemStats, setScreen, setSystemStats } = useAppStore();
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

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

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

      <div className="flex-1 space-y-6">
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

        {/* Placeholder sections */}
        <div className="bg-obd-surface rounded-lg p-4 opacity-50">
          <h2 className="text-lg font-semibold text-obd-dim">Bluetooth (Phase 2)</h2>
        </div>
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
