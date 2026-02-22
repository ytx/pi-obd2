import { MeterConfig, NumericConfig, GraphConfig } from '@/types';
import { DEFAULT_METER_CONFIG, DEFAULT_NUMERIC_CONFIG, DEFAULT_GRAPH_CONFIG } from '@/config/defaults';

export interface ThemeProperties {
  [key: string]: string;
}

export interface ThemeAssets {
  dialBackground?: string;
  displayBackground?: string;
  background?: string;
  fontBase64?: string;
}

export interface ParsedTheme {
  meterConfig: MeterConfig;
  numericConfig: NumericConfig;
  graphConfig: GraphConfig;
  assets: ThemeAssets;
}

function parseColor(value: string): string | undefined {
  if (!value) return undefined;
  // Torque uses #RRGGBB or #AARRGGBB
  if (value.startsWith('#')) {
    if (value.length === 9) {
      // #AARRGGBB → #RRGGBBAA (CSS format)
      const a = value.substring(1, 3);
      const rgb = value.substring(3);
      return `#${rgb}${a}`;
    }
    return value;
  }
  return undefined;
}

function parseFloat0(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

/** Convert Torque properties to MeterConfig */
export function propertiesToMeterConfig(
  props: ThemeProperties,
  pid?: string,
): MeterConfig {
  const d = DEFAULT_METER_CONFIG;

  // Angles - PID-specific overrides
  const startKey = pid ? `dialStartAngle_${pid}` : undefined;
  const stopKey = pid ? `dialStopAngle_${pid}` : undefined;
  const startAngle = parseFloat0(
    (startKey && props[startKey]) || props.globalDialStartAngle,
    d.startAngle,
  );
  const stopAngle = parseFloat0(
    (stopKey && props[stopKey]) || props.globalDialStopAngle,
    d.stopAngle,
  );

  // Ticks
  const hideKey = pid ? `hideTicks_${pid}` : undefined;
  const hideTicks = parseBool(
    (hideKey && props[hideKey]) || props.globalHideTicks,
    d.hideTicks,
  );

  const tickColor = parseColor(props.displayTickColour) ?? d.tickColor;
  const needleColor = parseColor(props.dialNeedleColour) ?? d.needleColor;
  const valueColor = parseColor(props.displayTextValueColour) ?? d.valueColor;
  const titleColor = parseColor(props.displayTextTitleColour) ?? d.textColor;
  const indicatorColor = parseColor(props.displayIndicatorColour);

  return {
    startAngle,
    stopAngle,
    tickCount: d.tickCount,
    tickInnerRadius: parseFloat0(props.dialTickInnerRadius, d.tickInnerRadius),
    tickOuterRadius: parseFloat0(props.dialTickOuterRadius, d.tickOuterRadius),
    tickColor,
    needleColor: indicatorColor ?? needleColor,
    needleLength: parseFloat0(props.dialNeedleLength, d.needleLength),
    needleSizeRatio: parseFloat0(props.dialNeedleSizeRatio, d.needleSizeRatio),
    textColor: titleColor,
    valueColor,
    unitColor: parseColor(props.displayTextTitleColour) ?? d.unitColor,
    titleOffset: parseFloat0(props.dialNeedleTitleTextOffset, d.titleOffset),
    valueOffset: parseFloat0(props.dialNeedleValueTextOffset, d.valueOffset),
    unitOffset: parseFloat0(props.dialNeedleUnitTextOffset, d.unitOffset),
    scaleTextRadius: parseFloat0(props.globalTextRadius, d.scaleTextRadius),
    fontScale: parseFloat0(props.globalFontScale, d.fontScale),
    hideTicks,
  };
}

/** Convert Torque properties to NumericConfig */
export function propertiesToNumericConfig(props: ThemeProperties): NumericConfig {
  const d = DEFAULT_NUMERIC_CONFIG;
  return {
    fontSize: d.fontSize,
    valueColor: parseColor(props.displayTextValueColour) ?? d.valueColor,
    unitColor: parseColor(props.displayTextTitleColour) ?? d.unitColor,
    titleColor: parseColor(props.displayTextTitleColour) ?? d.titleColor,
    decimals: d.decimals,
  };
}

/** Make a semi-transparent fill color from a hex line color */
function toFillColor(hex: string): string {
  // #RRGGBB or #RRGGBBAA → rgba(r,g,b,0.15)
  const raw = hex.replace('#', '');
  const r = parseInt(raw.substring(0, 2), 16);
  const g = parseInt(raw.substring(2, 4), 16);
  const b = parseInt(raw.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

/** Convert Torque properties to GraphConfig */
export function propertiesToGraphConfig(props: ThemeProperties): GraphConfig {
  const d = DEFAULT_GRAPH_CONFIG;
  // graphLineColour → displayTextValueColour → default
  const lineColor =
    parseColor(props.graphLineColour) ??
    parseColor(props.displayTextValueColour) ??
    d.lineColor;
  return {
    timeWindowMs: d.timeWindowMs,
    lineColor,
    fillColor: toFillColor(lineColor),
    gridColor: d.gridColor,
    textColor: parseColor(props.displayTextTitleColour) ?? d.textColor,
    lineWidth: d.lineWidth,
  };
}

/** Parse full theme from properties + assets */
export function parseTheme(props: ThemeProperties, assets: ThemeAssets): ParsedTheme {
  return {
    meterConfig: propertiesToMeterConfig(props),
    numericConfig: propertiesToNumericConfig(props),
    graphConfig: propertiesToGraphConfig(props),
    assets,
  };
}
