import { MeterConfig } from '@/types';

export interface MeterRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  value: number;
  min: number;
  max: number;
  title: string;
  unit: string;
  config: MeterConfig;
}

export function renderMeter(params: MeterRenderParams): void {
  const { ctx, width, height, value, min, max, title, unit, config } = params;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size / 2 - 4;

  ctx.clearRect(0, 0, width, height);

  // Angle calculation: 6 o'clock (bottom) = Math.PI/2 in standard math
  // startAngle/stopAngle = exclusion from bottom in degrees
  const sweepDeg = 360 - config.startAngle - config.stopAngle;
  const sweepRad = (sweepDeg * Math.PI) / 180;
  // Arc starts from bottom + stopAngle (clockwise from left side)
  const arcStartRad = Math.PI / 2 + (config.stopAngle * Math.PI) / 180;

  // Value position in arc (0-1)
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = max > min ? (clamped - min) / (max - min) : 0;

  // Draw ticks
  if (!config.hideTicks) {
    const tickCount = config.tickCount;
    for (let i = 0; i <= tickCount; i++) {
      const t = i / tickCount;
      const angle = arcStartRad + t * sweepRad;
      const inner = radius * config.tickInnerRadius;
      const outer = radius * config.tickOuterRadius;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(cx + inner * cos, cy + inner * sin);
      ctx.lineTo(cx + outer * cos, cy + outer * sin);
      ctx.strokeStyle = config.tickColor;
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.stroke();
    }
  }

  // Draw scale numbers
  const majorCount = config.tickCount;
  const scaleR = radius * config.scaleTextRadius;
  ctx.fillStyle = config.textColor;
  ctx.font = `${Math.round(size * 0.06 * config.fontScale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= majorCount; i += 5) {
    const t = i / majorCount;
    const angle = arcStartRad + t * sweepRad;
    const label = Math.round(min + t * (max - min));
    ctx.fillText(String(label), cx + scaleR * Math.cos(angle), cy + scaleR * Math.sin(angle));
  }

  // Draw needle
  const needleAngle = arcStartRad + ratio * sweepRad;
  const needleLen = radius * config.needleLength;
  const needleWidth = size * config.needleSizeRatio;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(needleAngle);
  ctx.beginPath();
  ctx.moveTo(needleLen, 0);
  ctx.lineTo(-needleWidth * 2, -needleWidth);
  ctx.lineTo(-needleWidth * 2, needleWidth);
  ctx.closePath();
  ctx.fillStyle = config.needleColor;
  ctx.fill();
  ctx.restore();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = config.needleColor;
  ctx.fill();

  // Draw title
  ctx.fillStyle = config.textColor;
  ctx.font = `${Math.round(size * 0.07 * config.fontScale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, cy + radius * config.titleOffset);

  // Draw value
  ctx.fillStyle = config.valueColor;
  ctx.font = `bold ${Math.round(size * 0.12 * config.fontScale)}px sans-serif`;
  ctx.fillText(String(Math.round(clamped)), cx, cy + radius * config.valueOffset);

  // Draw unit
  ctx.fillStyle = config.unitColor;
  ctx.font = `${Math.round(size * 0.06 * config.fontScale)}px sans-serif`;
  ctx.fillText(unit, cx, cy + radius * config.unitOffset);
}
