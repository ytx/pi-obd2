import { GraphConfig } from '@/types';
import { TimePoint } from './time-buffer';

export interface GraphRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  points: TimePoint[];
  min: number;
  max: number;
  title: string;
  unit: string;
  config: GraphConfig;
}

const MARGIN = { top: 8, right: 8, bottom: 24, left: 48 };

export function renderGraph(params: GraphRenderParams): void {
  const { ctx, width, height, points, min, max, title, unit, config } = params;

  ctx.clearRect(0, 0, width, height);

  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  if (plotW <= 0 || plotH <= 0) return;

  const now = Date.now();
  const windowStart = now - config.timeWindowMs;
  const range = max - min || 1;

  // Grid lines
  ctx.strokeStyle = config.gridColor;
  ctx.lineWidth = 1;
  const gridRows = 4;
  for (let i = 0; i <= gridRows; i++) {
    const y = MARGIN.top + (i / gridRows) * plotH;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, y);
    ctx.lineTo(MARGIN.left + plotW, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = config.textColor;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= gridRows; i++) {
    const y = MARGIN.top + (i / gridRows) * plotH;
    const val = max - (i / gridRows) * range;
    ctx.fillText(String(Math.round(val)), MARGIN.left - 4, y);
  }

  // Title + unit label
  ctx.fillStyle = config.textColor;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${title} (${unit})`, width / 2, height - 2);

  if (points.length < 2) return;

  // Map points to pixel coords
  const toX = (ts: number) => MARGIN.left + ((ts - windowStart) / config.timeWindowMs) * plotW;
  const toY = (v: number) => MARGIN.top + (1 - (v - min) / range) * plotH;

  // Fill area
  ctx.beginPath();
  ctx.moveTo(toX(points[0].timestamp), MARGIN.top + plotH);
  for (const p of points) {
    ctx.lineTo(toX(p.timestamp), toY(p.value));
  }
  ctx.lineTo(toX(points[points.length - 1].timestamp), MARGIN.top + plotH);
  ctx.closePath();
  ctx.fillStyle = config.fillColor;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(toX(points[0].timestamp), toY(points[0].value));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(toX(points[i].timestamp), toY(points[i].value));
  }
  ctx.strokeStyle = config.lineColor;
  ctx.lineWidth = config.lineWidth;
  ctx.stroke();
}
