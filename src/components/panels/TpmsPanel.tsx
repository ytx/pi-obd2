import { useTpmsStore, TirePosition } from '@/stores/useTpmsStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { convertPressure } from '@/hooks/usePressureUnit';

const POSITIONS: [TirePosition, TirePosition, TirePosition, TirePosition] = ['FL', 'FR', 'RL', 'RR'];
const LABELS: Record<TirePosition, string> = { FL: 'FL', FR: 'FR', RL: 'RL', RR: 'RR' };

function TpmsPanel() {
  const pressureUnit = useTpmsStore((s) => s.pressureUnit);
  const alertThreshold = useTpmsStore((s) => s.alertThreshold);
  const assignments = useTpmsStore((s) => s.sensorAssignments);
  const values = useOBDStore((s) => s.currentValues);

  const formatP = (kPa: number): string => {
    const v = convertPressure(kPa, pressureUnit);
    switch (pressureUnit) {
      case 'kPa': return Math.round(v).toString();
      case 'psi': return v.toFixed(1);
      case 'bar': return v.toFixed(2);
    }
  };

  return (
    <div className="h-full w-full grid grid-cols-2 grid-rows-2 gap-1 p-1">
      {POSITIONS.map((pos) => {
        const assigned = assignments[pos] !== null;
        const pressure = values[`TPMS_${pos}_P`]?.value ?? null;
        const temperature = values[`TPMS_${pos}_T`]?.value ?? null;
        const isLow = pressure !== null && pressure < alertThreshold;

        return (
          <div
            key={pos}
            className={`flex flex-col items-center justify-center rounded-lg ${
              !assigned
                ? 'bg-obd-surface/30 text-obd-dim'
                : isLow
                  ? 'bg-red-900/60 text-red-200'
                  : 'bg-obd-surface/50 text-white'
            }`}
          >
            <span className="text-xs font-bold opacity-60">{LABELS[pos]}</span>
            {assigned && pressure !== null ? (
              <>
                <span className={`text-lg font-bold leading-tight ${isLow ? 'text-red-300 animate-pulse' : ''}`}>
                  {formatP(pressure)}
                </span>
                <span className="text-[10px] opacity-50">{pressureUnit}</span>
                {temperature !== null && (
                  <span className="text-xs opacity-60">{Math.round(temperature)}°C</span>
                )}
              </>
            ) : (
              <span className="text-xs opacity-40">--</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TpmsPanel;
