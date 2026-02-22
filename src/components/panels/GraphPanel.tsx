import { useEffect, useRef } from 'react';
import { GraphConfig } from '@/types';
import { useOBDStore } from '@/stores/useOBDStore';
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

    const points = bufferRef.current.getWindow(config.timeWindowMs);

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

export default GraphPanel;
