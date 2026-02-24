import { useState } from 'react';
import { BTDevice } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';

function BluetoothSection() {
  const [devices, setDevices] = useState<BTDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const obdBtAddress = useOBDStore((s) => s.obdBtAddress);
  const setObdBtAddress = useOBDStore((s) => s.setObdBtAddress);

  const handleScan = async () => {
    setScanning(true);
    setMessage(null);
    try {
      const result = await window.obd2API.btScan();
      setDevices(result);
      if (result.length === 0) setMessage('デバイスが見つかりません');
    } catch (e) {
      console.error('BT scan failed:', e);
      setMessage('スキャン失敗');
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
    } else {
      setMessage(`Pair 失敗: ${result.error ?? address}`);
    }
    setBusyAddress(null);
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
      setMessage(`切断失敗: ${result.error ?? address}`);
    }
    setBusyAddress(null);
  };

  const handleSetObd = (address: string) => {
    setObdBtAddress(address);
    setMessage(`OBD2 デバイスに設定: ${address}`);
  };

  const handleClearObd = () => {
    setObdBtAddress(null);
    setMessage('OBD2 デバイス設定を解除');
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

      {obdBtAddress && (
        <div className="mb-3 flex items-center justify-between bg-green-900/20 border border-green-700 rounded p-2">
          <span className="text-sm text-green-400">OBD2: {obdBtAddress}</span>
          <button
            onClick={handleClearObd}
            className="px-2 py-1 text-xs text-obd-dim border border-obd-dim rounded hover:bg-obd-dim/30"
          >
            Clear
          </button>
        </div>
      )}

      {devices.length === 0 ? (
        <p className="text-sm text-obd-dim">No devices found. Tap Scan to search.</p>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => {
            const isObd = d.address === obdBtAddress;
            return (
              <div
                key={d.address}
                className={`flex items-center justify-between rounded p-3 min-h-[48px] ${
                  isObd ? 'bg-green-900/30 border border-green-600' : d.connected ? 'bg-green-900/30 border border-green-700' : d.paired ? 'bg-blue-900/20 border border-blue-800' : 'bg-obd-dark'
                }`}
              >
                <div>
                  <span className="text-white">{d.name || d.address}</span>
                  <span className="text-xs text-obd-dim ml-2">{d.address}</span>
                  {isObd && <span className="text-xs text-green-400 ml-2">OBD2</span>}
                  {d.connected && <span className="text-xs text-green-400 ml-2">接続中</span>}
                  {!d.connected && d.paired && !isObd && <span className="text-xs text-blue-400 ml-2">Paired</span>}
                  {d.rssi !== undefined && (
                    <span className="text-xs text-obd-dim ml-2">{d.rssi}dBm</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {d.paired && !isObd && (
                    <button
                      onClick={() => handleSetObd(d.address)}
                      disabled={busyAddress !== null}
                      className="px-3 py-2 text-sm bg-obd-surface text-green-400 border border-green-700 rounded-lg disabled:opacity-50"
                    >
                      OBD2 に設定
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
                    <span className="text-sm text-blue-400">✓ Paired</span>
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
            );
          })}
        </div>
      )}
      {message && (
        <p className="text-obd-dim text-sm mt-3">{message}</p>
      )}
    </div>
  );
}

export default BluetoothSection;
