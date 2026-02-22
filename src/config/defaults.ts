import { MeterConfig, GraphConfig, NumericConfig, PanelDef, Layout, Board } from '@/types';

export const DEFAULT_METER_CONFIG: MeterConfig = {
  startAngle: 45,
  stopAngle: 45,
  tickCount: 10,
  tickInnerRadius: 0.7,
  tickOuterRadius: 0.85,
  tickColor: '#4a4a6a',
  needleColor: '#ff2e63',
  needleLength: 0.75,
  needleSizeRatio: 0.03,
  textColor: '#ffffff',
  valueColor: '#00d4ff',
  unitColor: '#4a4a6a',
  titleOffset: -0.25,
  valueOffset: 0.15,
  unitOffset: 0.30,
  scaleTextRadius: 0.55,
  fontScale: 1.0,
  hideTicks: false,
};

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  timeWindowMs: 30000,
  lineColor: '#00d4ff',
  fillColor: 'rgba(0, 212, 255, 0.15)',
  gridColor: '#1a1a2e',
  textColor: '#4a4a6a',
  lineWidth: 2,
};

export const DEFAULT_NUMERIC_CONFIG: NumericConfig = {
  fontSize: 36,
  valueColor: '#ffffff',
  unitColor: '#0abdc6',
  titleColor: '#4a4a6a',
  decimals: 1,
};

export const DEFAULT_PANELS: PanelDef[] = [
  {
    id: 'rpm-meter',
    kind: 'meter',
    pid: '010C',
    label: 'RPM',
    config: { ...DEFAULT_METER_CONFIG },
  },
  {
    id: 'speed-meter',
    kind: 'meter',
    pid: '010D',
    label: 'Speed',
    config: { ...DEFAULT_METER_CONFIG },
  },
  {
    id: 'rpm-graph',
    kind: 'graph',
    pid: '010C',
    label: 'RPM',
    config: { ...DEFAULT_GRAPH_CONFIG },
  },
  {
    id: 'coolant-numeric',
    kind: 'numeric',
    pid: '0105',
    label: 'Coolant',
    config: { ...DEFAULT_NUMERIC_CONFIG, decimals: 0 },
  },
  {
    id: 'throttle-numeric',
    kind: 'numeric',
    pid: '0111',
    label: 'Throttle',
    config: { ...DEFAULT_NUMERIC_CONFIG, decimals: 1 },
  },
];

export const DEFAULT_LAYOUT: Layout = {
  id: 'default',
  name: 'Default',
  columns: 4,
  rows: 3,
  gap: 4,
  cells: [
    { row: 0, col: 0, rowSpan: 2, colSpan: 2 }, // slot 0: RPM meter
    { row: 0, col: 2, rowSpan: 2, colSpan: 2 }, // slot 1: Speed meter
    { row: 2, col: 0, colSpan: 2 },              // slot 2: RPM graph
    { row: 2, col: 2 },                           // slot 3: Coolant
    { row: 2, col: 3 },                           // slot 4: Throttle
  ],
};

export const DEFAULT_BOARD: Board = {
  id: 'main',
  name: 'Main',
  layoutId: 'default',
  panels: ['rpm-meter', 'speed-meter', 'rpm-graph', 'coolant-numeric', 'throttle-numeric'],
};
