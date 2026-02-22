import { useState } from 'react';
import { WiFiNetwork } from '@/types';

function WiFiSection() {
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedSsid, setSelectedSsid] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await window.obd2API.wifiScan();
      setNetworks(result);
    } catch (e) {
      console.error('WiFi scan failed:', e);
    }
    setScanning(false);
  };

  const handleConnect = async (ssid: string) => {
    setConnectingSsid(ssid);
    try {
      const ok = await window.obd2API.wifiConnect(ssid, passwordInput);
      if (ok) {
        setNetworks((prev) =>
          prev.map((n) => ({
            ...n,
            connected: n.ssid === ssid,
          })),
        );
        setSelectedSsid(null);
        setPasswordInput('');
      }
    } catch (e) {
      console.error('WiFi connect failed:', e);
    }
    setConnectingSsid(null);
  };

  const handleDisconnect = async () => {
    await window.obd2API.wifiDisconnect();
    setNetworks((prev) => prev.map((n) => ({ ...n, connected: false })));
  };

  const signalBars = (signal: number): string => {
    if (signal >= 75) return '||||';
    if (signal >= 50) return '||| ';
    if (signal >= 25) return '||  ';
    return '|   ';
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-obd-primary">WiFi</h2>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-3 py-1 text-sm bg-obd-dark text-obd-accent border border-obd-dim rounded hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      </div>
      {networks.length === 0 ? (
        <p className="text-sm text-obd-dim">No networks found. Tap Scan to search.</p>
      ) : (
        <div className="space-y-2">
          {networks.map((n) => (
            <div key={n.ssid}>
              <div className="flex items-center justify-between bg-obd-dark rounded p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-obd-accent font-mono">{signalBars(n.signal)}</span>
                  <span className="text-sm text-white">{n.ssid}</span>
                  <span className="text-xs text-obd-dim">{n.security}</span>
                </div>
                <div>
                  {n.connected ? (
                    <button
                      onClick={handleDisconnect}
                      className="px-2 py-1 text-xs bg-obd-surface text-obd-warn border border-obd-dim rounded"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedSsid(selectedSsid === n.ssid ? null : n.ssid)}
                      className="px-2 py-1 text-xs bg-obd-surface text-obd-primary border border-obd-dim rounded"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {selectedSsid === n.ssid && !n.connected && (
                <div className="flex gap-2 mt-1 ml-8">
                  <input
                    type="password"
                    placeholder="Password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm bg-obd-dark text-white border border-obd-dim rounded"
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect(n.ssid)}
                  />
                  <button
                    onClick={() => handleConnect(n.ssid)}
                    disabled={connectingSsid !== null}
                    className="px-3 py-1 text-sm bg-green-700 text-white rounded disabled:opacity-50"
                  >
                    {connectingSsid === n.ssid ? '...' : 'OK'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WiFiSection;
