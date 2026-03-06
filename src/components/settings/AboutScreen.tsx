import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';

const formatUptime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

function AboutScreen() {
  const { setScreen, hostname, systemStats, setSystemStats } = useAppStore();

  const pollStats = useCallback(() => {
    if (window.obd2API) {
      window.obd2API.getSystemStats().then(setSystemStats);
    }
  }, [setSystemStats]);

  useEffect(() => {
    pollStats();
    const id = setInterval(pollStats, 2000);
    return () => clearInterval(id);
  }, [pollStats]);

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">About</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {/* App Info */}
        <section className="bg-obd-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold text-obd-primary mb-3">Application</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-obd-dim">Name</span>
            <span className="text-white">pi-obd2</span>
            <span className="text-obd-dim">Version</span>
            <span className="text-white">0.1.0</span>
            <span className="text-obd-dim">Commit</span>
            <span className="text-white font-mono">{__GIT_COMMIT__}</span>
          </div>
        </section>

        {/* System Info */}
        <section className="bg-obd-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold text-obd-primary mb-3">System</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-obd-dim">Hostname</span>
            <span className="text-white">{hostname || '-'}</span>
            {systemStats && (
              <>
                <span className="text-obd-dim">CPU</span>
                <span className="text-white">{systemStats.cpuUsage}% / {systemStats.cpuTemp}&deg;C</span>
                <span className="text-obd-dim">Memory</span>
                <span className="text-white">{systemStats.memTotal - systemStats.memFree} / {systemStats.memTotal} MB</span>
                <span className="text-obd-dim">Uptime</span>
                <span className="text-white">{formatUptime(systemStats.uptime)}</span>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AboutScreen;
