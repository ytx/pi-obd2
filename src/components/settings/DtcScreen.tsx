import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState } from '@/types';

interface DtcEntry {
  code: string;
  description: string;
}

function DtcScreen() {
  const { setScreen } = useAppStore();
  const { connectionState, setConnectionState } = useOBDStore();
  const [dtcs, setDtcs] = useState<DtcEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.obd2API.obdGetState().then((s) => setConnectionState(s as OBDConnectionState));
    const removeConn = window.obd2API.onOBDConnectionChange((s) => {
      setConnectionState(s as OBDConnectionState);
    });
    return () => { removeConn(); };
  }, [setConnectionState]);

  const isConnected = connectionState === 'connected';

  const handleRead = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await window.obd2API.dtcRead();
      setDtcs(result);
      setMessage(result.length === 0 ? 'No DTCs found.' : `${result.length} DTC(s) found.`);
    } catch (err) {
      setMessage(`Read failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all DTCs? This will reset the Check Engine light.')) return;
    setLoading(true);
    setMessage(null);
    try {
      await window.obd2API.dtcClear();
      setDtcs([]);
      setMessage('DTCs cleared.');
    } catch (err) {
      setMessage(`Clear failed: ${err}`);
    } finally {
      setLoading(false);
    }
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
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">DTCs</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {/* Status + Actions */}
        <div className="bg-obd-surface rounded-lg p-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-lg font-semibold text-obd-primary">Status:</span>
            <span className={`font-medium ${stateColor[connectionState] ?? 'text-obd-dim'}`}>
              {connectionState.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRead}
              disabled={!isConnected || loading}
              className="px-4 py-2 bg-obd-surface text-obd-accent border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
            >
              {loading ? 'Reading...' : 'Read DTCs'}
            </button>
            <button
              onClick={handleClear}
              disabled={!isConnected || loading}
              className="px-4 py-2 bg-obd-surface text-obd-warn border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors disabled:opacity-50"
            >
              Clear DTCs
            </button>
          </div>
        </div>

        {/* DTC List */}
        {dtcs.length > 0 && (
          <div className="bg-obd-surface rounded-lg p-4">
            <h2 className="text-lg font-semibold text-obd-primary mb-3">
              Diagnostic Trouble Codes ({dtcs.length})
            </h2>
            <div className="space-y-2">
              {dtcs.map((dtc) => (
                <div
                  key={dtc.code}
                  className="flex items-start gap-3 rounded p-3 bg-obd-dark"
                >
                  <span className="text-red-400 font-mono font-bold text-lg shrink-0">
                    {dtc.code}
                  </span>
                  <span className="text-white text-sm">{dtc.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {message && (
          <p className="text-obd-dim text-sm">{message}</p>
        )}
      </div>
    </div>
  );
}

export default DtcScreen;
