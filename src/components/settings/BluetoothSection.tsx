import { useState } from 'react';
import { BTDevice } from '@/types';

function BluetoothSection() {
  const [devices, setDevices] = useState<BTDevice[]>([]);
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await window.obd2API.btScan();
      setDevices(result);
    } catch (e) {
      console.error('BT scan failed:', e);
    }
    setScanning(false);
  };

  const handlePair = async (address: string) => {
    const ok = await window.obd2API.btPair(address);
    if (ok) {
      setDevices((prev) =>
        prev.map((d) => (d.address === address ? { ...d, paired: true } : d)),
      );
    }
  };

  const handleConnect = async (address: string) => {
    const ok = await window.obd2API.btConnect(address);
    if (ok) {
      setDevices((prev) =>
        prev.map((d) => (d.address === address ? { ...d, connected: true } : d)),
      );
    }
  };

  const handleDisconnect = async (address: string) => {
    const ok = await window.obd2API.btDisconnect(address);
    if (ok) {
      setDevices((prev) =>
        prev.map((d) => (d.address === address ? { ...d, connected: false } : d)),
      );
    }
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-obd-primary">Bluetooth</h2>
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
            <div key={d.address} className="flex items-center justify-between bg-obd-dark rounded p-2">
              <div>
                <span className="text-sm text-white">{d.name || d.address}</span>
                <span className="text-xs text-obd-dim ml-2">{d.address}</span>
                {d.rssi !== undefined && (
                  <span className="text-xs text-obd-dim ml-2">{d.rssi}dBm</span>
                )}
              </div>
              <div className="flex gap-2">
                {d.connected ? (
                  <button
                    onClick={() => handleDisconnect(d.address)}
                    className="px-2 py-1 text-xs bg-obd-surface text-obd-warn border border-obd-dim rounded"
                  >
                    Disconnect
                  </button>
                ) : d.paired ? (
                  <button
                    onClick={() => handleConnect(d.address)}
                    className="px-2 py-1 text-xs bg-green-700 text-white rounded"
                  >
                    Connect
                  </button>
                ) : (
                  <button
                    onClick={() => handlePair(d.address)}
                    className="px-2 py-1 text-xs bg-obd-surface text-obd-primary border border-obd-dim rounded"
                  >
                    Pair
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BluetoothSection;
