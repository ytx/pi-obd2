import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import WiFiSection from '@/components/settings/WiFiSection';
import UsbSection from '@/components/settings/UsbSection';
import GpioSection from '@/components/settings/GpioSection';

function SystemSettingsScreen() {
  const { hostname, systemStats, setScreen, setSystemStats } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [usbMounted, setUsbMounted] = useState(false);
  const [logSaveStatus, setLogSaveStatus] = useState<string | null>(null);
  const [configSaveStatus, setConfigSaveStatus] = useState<string | null>(null);

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

  // Poll USB mount status
  useEffect(() => {
    const poll = () => {
      if (window.obd2API) {
        window.obd2API.isUsbMounted().then(setUsbMounted);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const handleSaveConfig = async () => {
    if (configSaveStatus) return; // prevent double-click
    try {
      setConfigSaveStatus('Saving...');
      const result = await window.obd2API.saveConfig();
      setConfigSaveStatus(result.success ? 'Saved!' : `Failed: ${result.error}`);
    } catch (e) {
      setConfigSaveStatus(`Error: ${e}`);
    }
    setTimeout(() => setConfigSaveStatus(null), 5000);
  };

  const handleSaveLogs = async () => {
    try {
      setLogSaveStatus('Saving...');
      const result = await window.obd2API.saveLogsUsb();
      if (result.success) {
        setLogSaveStatus('Saved!');
      } else {
        setLogSaveStatus(`Error: ${result.error}`);
      }
    } catch (e) {
      setLogSaveStatus(`Error: ${e}`);
    }
    setTimeout(() => setLogSaveStatus(null), 3000);
  };

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {/* WiFi */}
        <WiFiSection />

        {/* USB Memory */}
        <UsbSection />

        {/* GPIO */}
        <GpioSection />

        {/* System Info */}
        <div className="bg-obd-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold text-obd-primary mb-3">System</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-obd-dim">Hostname</span>
            <span>{hostname || '-'} ({__GIT_COMMIT__})</span>
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
          onClick={handleSaveConfig}
          className="flex-1 py-3 bg-obd-surface text-obd-accent border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          {configSaveStatus ?? 'Save Config'}
        </button>
        {usbMounted && (
          <button
            onClick={handleSaveLogs}
            className="flex-1 py-3 bg-obd-surface text-obd-accent border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
          >
            {logSaveStatus ?? 'Save Logs'}
          </button>
        )}
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
