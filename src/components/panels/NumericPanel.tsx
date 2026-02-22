import { NumericConfig } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';
import { useThemeStore } from '@/stores/useThemeStore';

interface NumericPanelProps {
  pid: string;
  label: string;
  unit: string;
  config: NumericConfig;
}

function NumericPanel({ pid, label, unit, config }: NumericPanelProps) {
  const val = useOBDStore((s) => s.currentValues[pid]);
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const themeNumericConfig = useThemeStore((s) => s.themeNumericConfig);
  const displayBackgroundUrl = useThemeStore((s) => s.displayBackgroundUrl);
  const fontLoaded = useThemeStore((s) => s.fontLoaded);

  const activeConfig = currentThemeId ? themeNumericConfig : config;
  const fontFamily = fontLoaded ? 'TorqueThemeFont, sans-serif' : undefined;

  return (
    <div
      className="h-full flex flex-col items-center justify-center rounded-lg p-2 bg-cover bg-center"
      style={{
        backgroundColor: displayBackgroundUrl ? undefined : 'var(--color-obd-surface)',
        backgroundImage: displayBackgroundUrl ? `url(${displayBackgroundUrl})` : undefined,
      }}
    >
      <span
        className="text-xs font-medium mb-1 truncate w-full text-center"
        style={{ color: activeConfig.titleColor, fontFamily }}
      >
        {label}
      </span>
      <span
        className="font-bold tabular-nums"
        style={{
          color: activeConfig.valueColor,
          fontSize: `${activeConfig.fontSize}px`,
          fontFamily,
        }}
      >
        {val ? val.value.toFixed(activeConfig.decimals) : '--'}
      </span>
      <span className="text-xs mt-1" style={{ color: activeConfig.unitColor, fontFamily }}>
        {unit}
      </span>
    </div>
  );
}

export default NumericPanel;
