import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState } from '@/types';
import BluetoothSection from '@/components/settings/BluetoothSection';
import WiFiSection from '@/components/settings/WiFiSection';
import UsbSection from '@/components/settings/UsbSection';
import GpioSection from '@/components/settings/GpioSection';

function SystemSettingsScreen() {
  const { hostname, systemStats, setScreen, setSystemStats } = useAppStore();
  const {
    connectionState,
    isStubMode,
    obdBtAddress,
    setConnectionState,
    setStubMode,
  } = useOBDStore();
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

  useEffect(() => {
    if (!window.obd2API) return;
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
  }, [setStubMode, setConnectionState]);

  const handleConnect = async () => {
    try {
      await window.obd2API.obdConnect(obdBtAddress ?? undefined);
      // Refresh stub mode state (may have switched to ELM327)
      window.obd2API.obdIsStubMode().then(setStubMode);
    } catch (e) {
      console.error('Connect failed:', e);
    }
  };

  const handleConnectStub = async () => {
    try {
      await window.obd2API.obdConnectStub();
      window.obd2API.obdIsStubMode().then(setStubMode);
    } catch (e) {
      console.error('Stub connect failed:', e);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.obd2API.obdDisconnect();
    } catch (e) {
      console.error('Disconnect failed:', e);
    }
  };

  const handleSaveConfig = async () => {
    if (configSaveStatus) return; // prevent double-click
    try {
      setConfigSaveStatus('Saving...');
      const ok = await window.obd2API.saveConfig();
      setConfigSaveStatus(ok ? 'Saved!' : 'Failed');
    } catch (e) {
      setConfigSaveStatus(`Error: ${e}`);
    }
    setTimeout(() => setConfigSaveStatus(null), 3000);
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
            {obdBtAddress && (
              <span className={`text-xs px-2 py-1 rounded ${isStubMode ? 'bg-gray-700 text-gray-300' : 'bg-green-900 text-green-200'}`}>
                ELM327: {obdBtAddress}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {connectionState === 'disconnected' || connectionState === 'error' ? (
              <>
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={handleConnectStub}
                  className="px-4 py-2 bg-yellow-800 text-yellow-200 rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  Stub
                </button>
              </>
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

        {/* USB Memory */}
        <UsbSection />

        {/* GPIO */}
        <GpioSection />

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
