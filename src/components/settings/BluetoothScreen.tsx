import { useState } from 'react';
import { BTDevice } from '@/types';
import { useAppStore } from '@/stores/useAppStore';

function BluetoothScreen() {
  const { setScreen } = useAppStore();
  const [devices, setDevices] = useState<BTDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setMessage(null);
    try {
      const result = await window.obd2API.btScan();
      setDevices(result);
      if (result.length === 0) setMessage('No devices found');
    } catch {
      setMessage('Scan failed');
    }
    setScanning(false);
  };

  const handlePair = async (address: string) => {
    setBusyAddress(address);
    setMessage(null);
    const result = await window.obd2API.btPair(address);
    if (result.success) {
      setDevices((prev) =>
        prev.map((d) => (d.address === address ? { ...d, paired: true } : d)),
      );
      setMessage(`Paired: ${address}`);
      // Immediately rfcomm bind after pairing
      await handleRfcommBind(address);
    } else {
      setMessage(`Pair failed: ${result.error ?? address}`);
    }
    setBusyAddress(null);
  };

  const handleRfcommBind = async (address: string) => {
    const result = await window.obd2API.btRfcommBind(address);
    if (result.success) {
      setMessage((prev) => `${prev ?? ''} → rfcomm bound: ${result.devicePath}`);
    } else {
      setMessage((prev) => `${prev ?? ''} → rfcomm bind failed: ${result.error}`);
    }
  };

  const handleDisconnect = async (address: string) => {
    setBusyAddress(address);
    setMessage(null);
    const result = await window.obd2API.btDisconnect(address);
    if (result.success) {
      setDevices((prev) =>
        prev.map((d) => (d.address === address ? { ...d, connected: false } : d)),
      );
    } else {
      setMessage(`Disconnect failed: ${result.error ?? address}`);
    }
    setBusyAddress(null);
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
        <h1 className="text-2xl font-bold text-white">Bluetooth</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="bg-obd-surface rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-obd-primary">Devices</h2>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-3 py-1 text-sm bg-obd-dark text-obd-accent border border-obd-dim rounded hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
            >
              {scanning ? 'Scanning...' : 'Scan'}
            </button>
          </div>

          {devices.length === 0 ? (
            <p className="text-sm text-obd-dim">No devices found. Tap Scan to search.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div
                  key={d.address}
                  className={`flex items-center justify-between rounded p-3 min-h-[48px] ${
                    d.connected ? 'bg-green-900/30 border border-green-700' : d.paired ? 'bg-blue-900/20 border border-blue-800' : 'bg-obd-dark'
                  }`}
                >
                  <div>
                    <span className="text-white">{d.name || d.address}</span>
                    <span className="text-xs text-obd-dim ml-2">{d.address}</span>
                    {d.connected && <span className="text-xs text-green-400 ml-2">Connected</span>}
                    {!d.connected && d.paired && <span className="text-xs text-blue-400 ml-2">Paired</span>}
                    {d.rssi !== undefined && (
                      <span className="text-xs text-obd-dim ml-2">{d.rssi}dBm</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {d.paired && (
                      <button
                        onClick={() => handleRfcommBind(d.address)}
                        disabled={busyAddress !== null}
                        className="px-3 py-2 text-sm bg-obd-surface text-obd-accent border border-obd-dim rounded-lg disabled:opacity-50"
                      >
                        Bind rfcomm
                      </button>
                    )}
                    {d.connected ? (
                      <button
                        onClick={() => handleDisconnect(d.address)}
                        disabled={busyAddress !== null}
                        className="px-4 py-2 text-sm bg-obd-surface text-obd-warn border border-obd-dim rounded-lg disabled:opacity-50"
                      >
                        {busyAddress === d.address ? '...' : 'Disconnect'}
                      </button>
                    ) : d.paired ? (
                      <span className="text-sm text-blue-400 flex items-center">✓ Paired</span>
                    ) : (
                      <button
                        onClick={() => handlePair(d.address)}
                        disabled={busyAddress !== null}
                        className="px-4 py-2 text-sm bg-obd-surface text-obd-primary border border-obd-dim rounded-lg disabled:opacity-50"
                      >
                        {busyAddress === d.address ? 'Pairing...' : 'Pair'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {message && (
            <p className="text-obd-dim text-sm mt-3">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default BluetoothScreen;
