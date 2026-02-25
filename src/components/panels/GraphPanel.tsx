import { useEffect, useRef, useState } from 'react';
import { GraphConfig } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { renderGraph } from '@/canvas/graph-renderer';
import { TimeBuffer } from '@/canvas/time-buffer';
import { useCanvasSize } from './useCanvasSize';

interface GraphPanelProps {
  pid: string;
  label: string;
  min: number;
  max: number;
  unit: string;
  config: GraphConfig;
}

function GraphPanel({ pid, label, min, max, unit, config }: GraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef(new TimeBuffer(300));
  const { width, height, dpr } = useCanvasSize(containerRef);
  const val = useOBDStore((s) => s.currentValues[pid]);
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const themeGraphConfig = useThemeStore((s) => s.themeGraphConfig);
  const displayBackgroundUrl = useThemeStore((s) => s.displayBackgroundUrl);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  // Load display background image
  useEffect(() => {
    if (!displayBackgroundUrl) {
      setBgImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = displayBackgroundUrl;
  }, [displayBackgroundUrl]);

  // Use theme config if active, but preserve per-slot overrides (timeWindowMs)
  const activeConfig = currentThemeId
    ? { ...themeGraphConfig, timeWindowMs: config.timeWindowMs }
    : config;

  // Push new values into buffer
  useEffect(() => {
    if (val) {
      bufferRef.current.push(val.value, val.timestamp);
    }
  }, [val]);

  // Render on value change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = bufferRef.current.getWindow(activeConfig.timeWindowMs);

    ctx.save();
    ctx.scale(dpr, dpr);
    renderGraph({
      ctx,
      width,
      height,
      points,
      min,
      max,
      title: label,
      unit,
      config: activeConfig,
      backgroundImage: bgImage,
    });
    ctx.restore();
  }, [width, height, dpr, val, min, max, label, unit, activeConfig, bgImage]);

  return (
    <div ref={containerRef} className={`h-full w-full rounded-lg overflow-hidden ${currentThemeId ? '' : 'bg-obd-surface'}`}>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

export default GraphPanel;
