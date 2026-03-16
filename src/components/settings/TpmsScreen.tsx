import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useTpmsStore, TirePosition } from '@/stores/useTpmsStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { OBDConnectionState } from '@/types';
import { convertPressure, formatPressure } from '@/hooks/usePressureUnit';

const POSITIONS: TirePosition[] = ['FL', 'FR', 'RL', 'RR'];

function TpmsScreen() {
  const { setScreen } = useAppStore();
  const {
    tpmsConnectionState,
    isTpmsStubMode,
    discoveredSensors,
    sensorAssignments,
    pressureUnit,
    alertThreshold,
    setTpmsConnectionState,
    setTpmsStubMode,
    setSensorAssignment,
    setPressureUnit,
    setAlertThreshold,
    addOrUpdateSensor,
    setDiscoveredSensors,
  } = useTpmsStore();
  const values = useOBDStore((s) => s.currentValues);
  const [message, setMessage] = useState<string | null>(null);

  const updateValues = useOBDStore((s) => s.updateValues);

  useEffect(() => {
    window.obd2API.tpmsIsStubMode().then(setTpmsStubMode);
    window.obd2API.tpmsGetState().then((s) => setTpmsConnectionState(s as OBDConnectionState));
    window.obd2API.tpmsGetSensors().then(setDiscoveredSensors);

    const removeConn = window.obd2API.onTPMSConnectionChange((s) => {
      setTpmsConnectionState(s as OBDConnectionState);
      if (s === 'connected') {
        window.obd2API.tpmsIsStubMode().then(setTpmsStubMode);
      }
    });
    const removeSensor = window.obd2API.onTPMSSensorDiscovered((sensor) => {
      addOrUpdateSensor(sensor);
    });
    // Listen for TPMS data so tire cards update while on this screen
    const removeData = window.obd2API.onTPMSData(updateValues);
    return () => { removeConn(); removeSensor(); removeData(); };
  }, [setTpmsConnectionState, setTpmsStubMode, addOrUpdateSensor, setDiscoveredSensors, updateValues]);

  const handleConnect = () => {
    setMessage('Starting TPMS scan...');
    window.obd2API.tpmsConnect();
  };

  const handleConnectStub = () => {
    setMessage('Connecting TPMS Simulator...');
    window.obd2API.tpmsConnectStub();
  };

  const handleDisconnect = async () => {
    setMessage(null);
    try {
      await window.obd2API.tpmsDisconnect();
    } catch (e) {
      setMessage(`Disconnect failed: ${e}`);
    }
  };

  const handleAssign = (sensorId: string, position: TirePosition | '') => {
    if (position === '') {
      // Find which position this sensor was assigned to and unassign
      for (const pos of POSITIONS) {
        if (sensorAssignments[pos] === sensorId) {
          setSensorAssignment(pos, null);
          window.obd2API.tpmsUnassignSensor(pos);
        }
      }
    } else {
      setSensorAssignment(position, sensorId);
      window.obd2API.tpmsAssignSensor(sensorId, position);
    }
  };

  const getAssignedPosition = (sensorId: string): TirePosition | '' => {
    for (const pos of POSITIONS) {
      if (sensorAssignments[pos] === sensorId) return pos;
    }
    return '';
  };

  const getAvailablePositions = (currentSensorId: string): (TirePosition | '')[] => {
    const result: (TirePosition | '')[] = [''];
    for (const pos of POSITIONS) {
      if (sensorAssignments[pos] === null || sensorAssignments[pos] === currentSensorId) {
        result.push(pos);
      }
    }
    return result;
  };

  const stateColor: Record<string, string> = {
    disconnected: 'text-obd-dim',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-obd-danger',
  };

  const isConnected = tpmsConnectionState === 'connected';
  const isConnecting = tpmsConnectionState === 'connecting';

  const alertThresholdDisplay = convertPressure(alertThreshold, pressureUnit);

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">TPMS</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Left: Scan + Sensors */}
        <div className="flex-1 flex flex-col overflow-auto space-y-3">
          {/* Status */}
          <div className="bg-obd-surface rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-obd-primary">Status:</span>
              <span className={`text-sm font-medium ${stateColor[tpmsConnectionState] ?? 'text-obd-dim'}`}>
                {tpmsConnectionState.toUpperCase()}
              </span>
              {isTpmsStubMode && isConnected && (
                <span className="text-xs bg-yellow-800 text-yellow-200 px-2 py-0.5 rounded">STUB</span>
              )}
            </div>
            <div className="flex gap-2">
              {isConnected || isConnecting ? (
                <button onClick={handleDisconnect} className="px-3 py-1.5 text-sm bg-obd-surface text-obd-warn border border-obd-dim rounded-lg">
                  Disconnect
                </button>
              ) : (
                <>
                  <button onClick={handleConnect} className="px-3 py-1.5 text-sm bg-obd-surface text-green-400 border border-green-700 rounded-lg">
                    Start Scan
                  </button>
                  <button onClick={handleConnectStub} className="px-3 py-1.5 text-sm bg-obd-surface text-yellow-400 border border-yellow-700 rounded-lg">
                    Simulator
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Discovered Sensors */}
          <div className="bg-obd-surface rounded-lg p-3 flex-1 overflow-auto">
            <h2 className="text-sm font-semibold text-obd-primary mb-2">
              Sensors ({discoveredSensors.length})
            </h2>
            <div className="space-y-2">
              {discoveredSensors.map((sensor) => {
                const assignedPos = getAssignedPosition(sensor.id);
                const available = getAvailablePositions(sensor.id);
                const ago = Math.round((Date.now() - sensor.lastSeen) / 1000);
                return (
                  <div key={sensor.id} className="bg-obd-dark rounded p-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-obd-dim truncate">{sensor.id}</div>
                      <div className="flex gap-3 text-xs text-white">
                        <span>{formatPressure(sensor.pressure, pressureUnit)} {pressureUnit}</span>
                        <span>{Math.round(sensor.temperature)}°C</span>
                        <span>{sensor.battery.toFixed(1)}V</span>
                        <span className="text-obd-dim">RSSI {sensor.rssi}</span>
                        <span className="text-obd-dim">{ago}s ago</span>
                      </div>
                    </div>
                    <select
                      value={assignedPos}
                      onChange={(e) => handleAssign(sensor.id, e.target.value as TirePosition | '')}
                      className="bg-obd-dark text-white text-sm border border-obd-dim rounded px-2 py-1"
                    >
                      {available.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos === '' ? 'None' : pos}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {discoveredSensors.length === 0 && (
                <p className="text-sm text-obd-dim py-2">
                  {isConnected ? 'Scanning for TPMS sensors...' : 'No sensors found. Start scan first.'}
                </p>
              )}
            </div>
          </div>

          {message && <p className="text-obd-dim text-sm">{message}</p>}
        </div>

        {/* Right: Tire Cards + Settings */}
        <div className="flex-1 flex flex-col space-y-3">
          {/* 4-tire card layout */}
          <div className="grid grid-cols-2 gap-2">
            {POSITIONS.map((pos) => {
              const sensorId = sensorAssignments[pos];
              const pressure = values[`TPMS_${pos}_P`]?.value ?? null;
              const temperature = values[`TPMS_${pos}_T`]?.value ?? null;
              const battery = values[`TPMS_${pos}_B`]?.value ?? null;
              const isLow = pressure !== null && pressure < alertThreshold;
              const assigned = sensorId !== null;

              return (
                <div
                  key={pos}
                  className={`rounded-lg p-3 flex flex-col items-center ${
                    !assigned
                      ? 'bg-obd-surface/30 border border-obd-dim/20'
                      : isLow
                        ? 'bg-red-900/50 border border-red-600'
                        : 'bg-obd-surface border border-obd-dim/30'
                  }`}
                >
                  <span className="text-sm font-bold text-obd-primary">{pos}</span>
                  {assigned && pressure !== null ? (
                    <>
                      <span className={`text-2xl font-bold ${isLow ? 'text-red-300 animate-pulse' : 'text-white'}`}>
                        {formatPressure(pressure, pressureUnit)}
                      </span>
                      <span className="text-xs text-obd-dim">{pressureUnit}</span>
                      {temperature !== null && (
                        <span className="text-sm text-obd-accent">{Math.round(temperature)}°C</span>
                      )}
                      {battery !== null && (
                        <span className="text-xs text-obd-dim">{battery.toFixed(1)}V</span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-obd-dim mt-2">Not assigned</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Settings */}
          <div className="bg-obd-surface rounded-lg p-3 space-y-3">
            <h2 className="text-sm font-semibold text-obd-primary">Settings</h2>
            <div className="flex items-center gap-3">
              <label className="text-sm text-white">Pressure Unit</label>
              <select
                value={pressureUnit}
                onChange={(e) => setPressureUnit(e.target.value as 'kPa' | 'psi' | 'bar')}
                className="bg-obd-dark text-white text-sm border border-obd-dim rounded px-2 py-1"
              >
                <option value="kPa">kPa</option>
                <option value="psi">psi</option>
                <option value="bar">bar</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-white">Alert Threshold</label>
              <input
                type="number"
                value={Math.round(alertThresholdDisplay)}
                onChange={(e) => {
                  const displayVal = Number(e.target.value);
                  // Convert back to kPa for storage
                  let kPa: number;
                  switch (pressureUnit) {
                    case 'psi': kPa = displayVal * 6.89476; break;
                    case 'bar': kPa = displayVal * 100; break;
                    default: kPa = displayVal;
                  }
                  setAlertThreshold(Math.round(kPa));
                }}
                className="w-20 bg-obd-dark text-white text-sm border border-obd-dim rounded px-2 py-1"
              />
              <span className="text-xs text-obd-dim">{pressureUnit}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TpmsScreen;
