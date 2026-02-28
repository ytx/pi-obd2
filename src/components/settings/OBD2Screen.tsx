import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState, SerialDevice } from '@/types';

function OBD2Screen() {
  const { setScreen } = useAppStore();
  const {
    connectionState,
    isStubMode,
    obdDevicePath,
    setConnectionState,
    setStubMode,
    setObdDevicePath,
  } = useOBDStore();
  const [devices, setDevices] = useState<SerialDevice[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const scanDevices = async () => {
    try {
      const result = await window.obd2API.serialScan();
      setDevices(result);
    } catch {
      setDevices([]);
    }
  };

  useEffect(() => {
    scanDevices();
    window.obd2API.obdIsStubMode().then(setStubMode);
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));

    // Listen for connection state changes while on this screen
    const removeConn = window.obd2API.onOBDConnectionChange((s) => {
      setConnectionState(s as OBDConnectionState);
      // Refresh stub mode when connected
      if (s === 'connected') {
        window.obd2API.obdIsStubMode().then(setStubMode);
      }
    });
    return () => { removeConn(); };
  }, [setStubMode, setConnectionState]);

  const handleConnect = (devicePath: string) => {
    setMessage(`Connecting to ${devicePath}...`);
    setObdDevicePath(devicePath);
    window.obd2API.obdConnect(devicePath);
  };

  const handleConnectStub = () => {
    setMessage('Connecting to Simulator...');
    setObdDevicePath(null);
    window.obd2API.obdConnectStub();
  };

  const handleDisconnect = async () => {
    setMessage(null);
    try {
      await window.obd2API.obdDisconnect();
    } catch (e) {
      setMessage(`Disconnect failed: ${e}`);
    }
  };

  const stateColor: Record<string, string> = {
    disconnected: 'text-obd-dim',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-obd-danger',
  };

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const connectedDevice = isConnected ? (isStubMode ? 'Simulator' : (obdDevicePath ?? 'unknown')) : null;

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">OBD2</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {/* Status */}
        <div className="bg-obd-surface rounded-lg p-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-lg font-semibold text-obd-primary">Status:</span>
            <span className={`font-medium ${stateColor[connectionState] ?? 'text-obd-dim'}`}>
              {connectionState.toUpperCase()}
            </span>
            {isConnected && connectedDevice && (
              <span className="text-sm text-obd-dim">({connectedDevice})</span>
            )}
            {isStubMode && isConnected && (
              <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-1 rounded">STUB</span>
            )}
          </div>
          {(isConnected || isConnecting) && (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-obd-surface text-obd-warn border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Serial Devices */}
        <div className="bg-obd-surface rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-obd-primary">Serial Devices</h2>
            <button
              onClick={scanDevices}
              className="px-3 py-1 text-sm bg-obd-dark text-obd-accent border border-obd-dim rounded hover:bg-obd-dim/30 transition-colors"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {devices.map((d) => {
              const isActive = isConnected && !isStubMode && obdDevicePath === d.path;
              return (
                <div
                  key={d.path}
                  className={`flex items-center justify-between rounded p-3 min-h-[48px] ${
                    isActive ? 'bg-green-900/30 border border-green-700' : 'bg-obd-dark'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isActive && <span className="text-green-400">●</span>}
                    <span className="text-white font-mono">{d.path}</span>
                    <span className="text-xs text-obd-dim">{d.type}</span>
                  </div>
                  {isActive ? (
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 text-sm bg-obd-surface text-obd-warn border border-obd-dim rounded-lg"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(d.path)}
                      disabled={isConnecting}
                      className="px-4 py-2 text-sm bg-obd-surface text-green-400 border border-green-700 rounded-lg disabled:opacity-50"
                    >
                      Connect
                    </button>
                  )}
                </div>
              );
            })}

            {devices.length === 0 && (
              <p className="text-sm text-obd-dim py-2">No serial devices found.</p>
            )}

            {/* Simulator separator and entry */}
            <div className="border-t border-obd-dim/30 my-2" />
            <div
              className={`flex items-center justify-between rounded p-3 min-h-[48px] ${
                isConnected && isStubMode ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-obd-dark'
              }`}
            >
              <div className="flex items-center gap-2">
                {isConnected && isStubMode && <span className="text-yellow-400">●</span>}
                <span className="text-white">Simulator</span>
                <span className="text-xs text-obd-dim">stub</span>
              </div>
              {isConnected && isStubMode ? (
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 text-sm bg-obd-surface text-obd-warn border border-obd-dim rounded-lg"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectStub}
                  disabled={isConnecting}
                  className="px-4 py-2 text-sm bg-obd-surface text-yellow-400 border border-yellow-700 rounded-lg disabled:opacity-50"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>

        {message && (
          <p className="text-obd-dim text-sm">{message}</p>
        )}
      </div>
    </div>
  );
}

export default OBD2Screen;
