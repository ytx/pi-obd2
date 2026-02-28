import { MeterConfig } from '@/types';
import { fillTextMono } from './mono-text';

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
  backgroundImage?: HTMLImageElement | null;
  needleImage?: HTMLImageElement | null;
  fontFamily?: string;
  decimals?: number;
}

export function renderMeter(params: MeterRenderParams): void {
  const { ctx, width, height, value, min, max, title, unit, config, backgroundImage, needleImage, fontFamily, decimals } = params;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size / 2 - 4;
  const font = fontFamily ?? 'sans-serif';

  ctx.clearRect(0, 0, width, height);

  // Draw background image (480x480 source scaled to panel size)
  if (backgroundImage) {
    const bgSize = size;
    const bx = cx - bgSize / 2;
    const by = cy - bgSize / 2;
    ctx.drawImage(backgroundImage, bx, by, bgSize, bgSize);
  }

  // Angle calculation: 6 o'clock (bottom) = Math.PI/2 in standard canvas coords
  // startAngle/stopAngle = exclusion angles from bottom (degrees)
  const sweepDeg = 360 - config.startAngle - config.stopAngle;
  const sweepRad = (sweepDeg * Math.PI) / 180;
  // Arc starts from bottom + startAngle (clockwise from left side)
  const arcStartRad = Math.PI / 2 + (config.startAngle * Math.PI) / 180;

  // Value position in arc (0-1)
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = max > min ? (clamped - min) / (max - min) : 0;

  // When a theme background image is present, skip tick lines (image has them).
  // Always draw scale numbers so the meter is readable.
  if (!backgroundImage) {
    // Draw ticks (default only)
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

    // Draw arc outline for default (no background image)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.92, arcStartRad, arcStartRad + sweepRad);
    ctx.strokeStyle = config.tickColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Scale numbers - always draw
  {
    const scaleR = radius * config.scaleTextRadius;
    const majorStep = config.tickCount >= 10 ? 5 : (config.tickCount >= 4 ? 2 : 1);
    ctx.fillStyle = config.textColor;
    ctx.font = `${Math.round(size * 0.06 * config.fontScale)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= config.tickCount; i += majorStep) {
      const t = i / config.tickCount;
      const angle = arcStartRad + t * sweepRad;
      const label = Math.round(min + t * (max - min));
      ctx.fillText(String(label), cx + scaleR * Math.cos(angle), cy + scaleR * Math.sin(angle));
    }
  }

  // Draw needle or arc depending on meterType
  const needleAngle = arcStartRad + ratio * sweepRad;

  if (config.meterType === 'arc') {
    // Arc mode: draw value arc (progress ring) only, no needle
    if (config.arcInnerRadius > 0 && config.arcOuterRadius > 0 && ratio > 0) {
      const innerR = radius * config.arcInnerRadius;
      const outerR = radius * config.arcOuterRadius;
      const arcEnd = arcStartRad + ratio * sweepRad;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, arcStartRad, arcEnd);
      ctx.arc(cx, cy, innerR, arcEnd, arcStartRad, true);
      ctx.closePath();
      ctx.fillStyle = config.arcColor;
      ctx.fill();
    }
  } else {
    // Needle mode
    if (needleImage) {
      // Needle image: 480x480, needle pointing at 12 o'clock (up = -π/2).
      // Rotate from 12 o'clock base to target angle: needleAngle - (-π/2) = needleAngle + π/2
      const imgSize = size;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(needleAngle + Math.PI / 2);
      ctx.drawImage(needleImage, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
      ctx.restore();
    } else {
      // Fallback: draw triangle needle
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

      // Center dot (only for fallback triangle needle)
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.03, 0, Math.PI * 2);
      ctx.fillStyle = config.needleColor;
      ctx.fill();
    }
  }

  // Draw title
  ctx.fillStyle = config.textColor;
  ctx.font = `${Math.round(size * 0.07 * config.fontScale)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, cy + radius * config.titleOffset);

  // Draw value (monospaced digits to prevent jitter with proportional fonts)
  ctx.fillStyle = config.valueColor;
  ctx.font = `bold ${Math.round(size * 0.12 * config.fontScale * config.valueFontScale)}px ${font}`;
  const valueText = decimals !== undefined ? clamped.toFixed(decimals) : String(Math.round(clamped));
  ctx.textBaseline = 'middle';
  fillTextMono(ctx, valueText, cx, cy + radius * config.valueOffset, 'center');

  // Draw unit
  ctx.fillStyle = config.unitColor;
  ctx.font = `${Math.round(size * 0.06 * config.fontScale)}px ${font}`;
  ctx.fillText(unit, cx, cy + radius * config.unitOffset);
}
