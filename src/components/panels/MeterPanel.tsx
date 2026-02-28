import { useEffect, useRef, useState } from 'react';
import { MeterConfig } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { renderMeter } from '@/canvas/meter-renderer';
import { useCanvasSize } from './useCanvasSize';

interface MeterPanelProps {
  pid: string;
  label: string;
  min: number;
  max: number;
  unit: string;
  config: MeterConfig;
  decimals?: number;
}

function MeterPanel({ pid, label, min, max, unit, config, decimals }: MeterPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize(containerRef);
  const val = useOBDStore((s) => s.currentValues[pid]);

  const dialBackgroundUrl = useThemeStore((s) => s.dialBackgroundUrl);
  const needleUrl = useThemeStore((s) => s.needleUrl);
  const themeMeterNeedleConfig = useThemeStore((s) => s.themeMeterNeedleConfig);
  const themeMeterArcConfig = useThemeStore((s) => s.themeMeterArcConfig);
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const fontLoaded = useThemeStore((s) => s.fontLoaded);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [needleImage, setNeedleImage] = useState<HTMLImageElement | null>(null);

  // Load dial background image
  useEffect(() => {
    if (!dialBackgroundUrl) {
      setBgImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = dialBackgroundUrl;
  }, [dialBackgroundUrl]);

  // Load needle image
  useEffect(() => {
    if (!needleUrl) {
      setNeedleImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setNeedleImage(img);
    img.onerror = () => setNeedleImage(null);
    img.src = needleUrl;
  }, [needleUrl]);

  // Use theme config if a theme is active, otherwise use prop config
  const activeConfig = currentThemeId
    ? (config.meterType === 'arc' ? themeMeterArcConfig : themeMeterNeedleConfig)
    : config;
  const fontFamily = fontLoaded ? 'TorqueThemeFont, sans-serif' : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    renderMeter({
      ctx,
      width,
      height,
      value: val?.value ?? min,
      min,
      max,
      title: label,
      unit,
      config: activeConfig,
      backgroundImage: bgImage,
      needleImage,
      fontFamily,
      decimals,
    });
    ctx.restore();
  }, [width, height, dpr, val, min, max, label, unit, activeConfig, bgImage, needleImage, fontFamily, decimals]);

  return (
    <div ref={containerRef} className={`h-full w-full rounded-lg overflow-hidden ${currentThemeId ? '' : 'bg-obd-surface'}`}>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

export default MeterPanel;
