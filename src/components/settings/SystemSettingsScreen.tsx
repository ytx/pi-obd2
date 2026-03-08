import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import UsbSection from '@/components/settings/UsbSection';

function SystemSettingsScreen() {
  const { setScreen } = useAppStore();
  const [usbMounted, setUsbMounted] = useState(false);
  const [logSaveStatus, setLogSaveStatus] = useState<string | null>(null);
  const [configSaveStatus, setConfigSaveStatus] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [captureFile, setCaptureFile] = useState<string | null>(null);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);

  // Poll USB mount status + capture status
  useEffect(() => {
    const poll = () => {
      if (window.obd2API) {
        window.obd2API.isUsbMounted().then(setUsbMounted);
        window.obd2API.captureStatus().then((s) => {
          setCapturing(s.capturing);
          setCaptureCount(s.count);
          setCaptureFile(s.filePath);
        });
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  const handleSaveConfig = async () => {
    if (configSaveStatus) return; // prevent double-click
    try {
      setConfigSaveStatus('Saving...');
      const result = await window.obd2API.saveConfig();
      if (!result.success) {
        window.obd2API.logSettings({ saveConfigError: result.error });
      }
      setConfigSaveStatus(result.success ? 'Saved!' : `Failed: ${result.error}`);
    } catch (e) {
      window.obd2API.logSettings({ saveConfigIpcError: String(e) });
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

  const handleCaptureStart = async () => {
    setCaptureMessage(null);
    const result = await window.obd2API.captureStart();
    if (result.success) {
      setCapturing(true);
      setCaptureFile(result.filePath ?? null);
      setCaptureCount(0);
    } else {
      setCaptureMessage(`Error: ${result.error}`);
      setTimeout(() => setCaptureMessage(null), 5000);
    }
  };

  const handleCaptureStop = async () => {
    await window.obd2API.captureStop();
    setCapturing(false);
    setCaptureMessage(`Saved ${captureCount} records`);
    setCaptureCount(0);
    setCaptureFile(null);
    setTimeout(() => setCaptureMessage(null), 5000);
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
        <h1 className="text-2xl font-bold text-white">System</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {/* USB Memory */}
        <UsbSection />

        {/* Capture */}
        {usbMounted && (
          <div className="bg-obd-surface rounded-lg p-4">
            <h2 className="text-lg font-semibold text-obd-primary mb-3">Data Capture</h2>
            <div className="flex items-center gap-4">
              {capturing ? (
                <>
                  <button
                    onClick={handleCaptureStop}
                    className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: '18px' }}>stop_circle</span>
                    Capture Stop
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm text-white font-mono">{captureCount.toLocaleString()} records</span>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleCaptureStart}
                  className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: '18px' }}>fiber_manual_record</span>
                  Capture Start
                </button>
              )}
            </div>
            {captureFile && (
              <p className="text-xs text-obd-dim mt-2 truncate">{captureFile}</p>
            )}
            {captureMessage && (
              <p className="text-sm text-obd-dim mt-2">{captureMessage}</p>
            )}
          </div>
        )}
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
