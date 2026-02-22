import { NumericConfig } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';

interface NumericPanelProps {
  pid: string;
  label: string;
  unit: string;
  config: NumericConfig;
}

function NumericPanel({ pid, label, unit, config }: NumericPanelProps) {
  const val = useOBDStore((s) => s.currentValues[pid]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-obd-surface rounded-lg p-2">
      <span
        className="text-xs font-medium mb-1 truncate w-full text-center"
        style={{ color: config.titleColor }}
      >
        {label}
      </span>
      <span
        className="font-bold tabular-nums"
        style={{ color: config.valueColor, fontSize: `${config.fontSize}px` }}
      >
        {val ? val.value.toFixed(config.decimals) : '--'}
      </span>
      <span className="text-xs mt-1" style={{ color: config.unitColor }}>
        {unit}
      </span>
    </div>
  );
}

export default NumericPanel;
