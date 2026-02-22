import { MeterConfig, GraphConfig, NumericConfig, PanelDef, Layout, Board } from '@/types';

export const DEFAULT_METER_CONFIG: MeterConfig = {
  startAngle: 45,
  stopAngle: 45,
  tickCount: 20,
  tickInnerRadius: 0.78,
  tickOuterRadius: 0.90,
  tickColor: '#4a4a6a',
  needleColor: '#ff2e63',
  needleLength: 0.72,
  needleSizeRatio: 0.03,
  textColor: '#ffffff',
  valueColor: '#00d4ff',
  unitColor: '#4a4a6a',
  titleOffset: -0.25,
  valueOffset: 0.15,
  unitOffset: 0.30,
  scaleTextRadius: 0.65,
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

// Display templates (kind + config, no PID)
export const DEFAULT_PANEL_DEFS: PanelDef[] = [
  { id: 'meter', kind: 'meter', config: { ...DEFAULT_METER_CONFIG } },
  { id: 'graph', kind: 'graph', config: { ...DEFAULT_GRAPH_CONFIG } },
  { id: 'numeric', kind: 'numeric', config: { ...DEFAULT_NUMERIC_CONFIG } },
  { id: 'numeric-int', kind: 'numeric', config: { ...DEFAULT_NUMERIC_CONFIG, decimals: 0 } },
];

export const DEFAULT_LAYOUT: Layout = {
  id: 'default',
  name: 'Default',
  columns: 4,
  rows: 3,
  gap: 4,
  cells: [
    { row: 0, col: 0, rowSpan: 2, colSpan: 2 }, // slot 0
    { row: 0, col: 2, rowSpan: 2, colSpan: 2 }, // slot 1
    { row: 2, col: 0, colSpan: 2 },              // slot 2
    { row: 2, col: 2 },                           // slot 3
    { row: 2, col: 3 },                           // slot 4
  ],
};

const DETAIL_LAYOUT: Layout = {
  id: 'detail',
  name: 'Detail',
  columns: 4,
  rows: 3,
  gap: 4,
  cells: [
    { row: 0, col: 0, rowSpan: 2, colSpan: 2 }, // slot 0
    { row: 0, col: 2 },                           // slot 1
    { row: 0, col: 3 },                           // slot 2
    { row: 1, col: 2 },                           // slot 3
    { row: 1, col: 3 },                           // slot 4
    { row: 2, col: 0, colSpan: 4 },              // slot 5
  ],
};

export const DEFAULT_LAYOUTS: Layout[] = [DEFAULT_LAYOUT, DETAIL_LAYOUT];

export const DEFAULT_BOARD: Board = {
  id: 'main',
  name: 'Main',
  layoutId: 'default',
  panels: [
    { panelDefId: 'meter', pid: '010C' },      // RPM meter
    { panelDefId: 'meter', pid: '010D' },      // Speed meter
    { panelDefId: 'graph', pid: '010C' },      // RPM graph
    { panelDefId: 'numeric-int', pid: '0105' }, // Coolant
    { panelDefId: 'numeric', pid: '0111' },    // Throttle
  ],
};

const DETAIL_BOARD: Board = {
  id: 'detail',
  name: 'Detail',
  layoutId: 'detail',
  panels: [
    { panelDefId: 'meter', pid: '0104' },      // Load meter
    { panelDefId: 'numeric-int', pid: '010F' }, // Intake temp
    { panelDefId: 'numeric-int', pid: '010B' }, // Manifold
    { panelDefId: 'numeric', pid: '0142' },    // Voltage
    { panelDefId: 'numeric-int', pid: '012F' }, // Fuel
    { panelDefId: 'graph', pid: '010D' },      // Speed graph
  ],
};

export const DEFAULT_BOARDS: Board[] = [DEFAULT_BOARD, DETAIL_BOARD];
