import { useEffect, useRef } from 'react';
import { MeterConfig } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';
import { renderMeter } from '@/canvas/meter-renderer';
import { useCanvasSize } from './useCanvasSize';

interface MeterPanelProps {
  pid: string;
  label: string;
  min: number;
  max: number;
  unit: string;
  config: MeterConfig;
}

function MeterPanel({ pid, label, min, max, unit, config }: MeterPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize(containerRef);
  const val = useOBDStore((s) => s.currentValues[pid]);

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
      config,
    });
    ctx.restore();
  }, [width, height, dpr, val, min, max, label, unit, config]);

  return (
    <div ref={containerRef} className="h-full w-full bg-obd-surface rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

export default MeterPanel;
