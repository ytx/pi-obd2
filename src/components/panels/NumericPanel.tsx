import { useMemo } from 'react';
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
      <MonoValue
        text={val ? val.value.toFixed(activeConfig.decimals) : '--'}
        color={activeConfig.valueColor}
        fontSize={activeConfig.fontSize}
        fontFamily={fontFamily}
      />
      <span className="text-xs mt-1" style={{ color: activeConfig.unitColor, fontFamily }}>
        {unit}
      </span>
    </div>
  );
}

/** Measure the widest digit (0-9) in px for the given font using an offscreen canvas */
function useDigitWidth(fontSize: number, fontFamily?: string): number {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return fontSize * 0.65; // fallback
    ctx.font = `bold ${fontSize}px ${fontFamily ?? 'sans-serif'}`;
    let maxW = 0;
    for (let d = 0; d <= 9; d++) {
      const w = ctx.measureText(String(d)).width;
      if (w > maxW) maxW = w;
    }
    return Math.ceil(maxW);
  }, [fontSize, fontFamily]);
}

/** Render each digit in a fixed-width cell so proportional fonts don't jitter */
function MonoValue({ text, color, fontSize, fontFamily }: {
  text: string; color: string; fontSize: number; fontFamily?: string;
}) {
  const chars = useMemo(() => text.split(''), [text]);
  const digitWidth = useDigitWidth(fontSize, fontFamily);
  return (
    <span className="font-bold inline-flex" style={{ color, fontSize: `${fontSize}px`, fontFamily }}>
      {chars.map((ch, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            textAlign: 'center',
            width: ch >= '0' && ch <= '9' ? `${digitWidth}px` : undefined,
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

export default NumericPanel;
