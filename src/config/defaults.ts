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

// 1big + 4small + 1wide
const DETAIL_LAYOUT: Layout = {
  id: 'detail',
  name: '1+4+Wide',
  columns: 4,
  rows: 3,
  gap: 4,
  cells: [
    { row: 0, col: 0, rowSpan: 2, colSpan: 2 }, // slot 0: big
    { row: 0, col: 2 },                           // slot 1
    { row: 0, col: 3 },                           // slot 2
    { row: 1, col: 2 },                           // slot 3
    { row: 1, col: 3 },                           // slot 4
    { row: 2, col: 0, colSpan: 4 },              // slot 5: wide
  ],
};

// 2x2 grid (4 equal panels)
const QUAD_LAYOUT: Layout = {
  id: 'quad',
  name: '2x2',
  columns: 2,
  rows: 2,
  gap: 4,
  cells: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ],
};

// 1big + 3small
const BIG1_LAYOUT: Layout = {
  id: 'big1',
  name: '1+3',
  columns: 4,
  rows: 2,
  gap: 4,
  cells: [
    { row: 0, col: 0, rowSpan: 2, colSpan: 2 }, // slot 0: big
    { row: 0, col: 2, colSpan: 2 },              // slot 1
    { row: 1, col: 2 },                           // slot 2
    { row: 1, col: 3 },                           // slot 3
  ],
};

// 3x2 grid (6 equal panels)
const GRID6_LAYOUT: Layout = {
  id: 'grid6',
  name: '3x2',
  columns: 3,
  rows: 2,
  gap: 4,
  cells: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
    { row: 1, col: 2 },
  ],
};

// 1wide top + 4 bottom
const WIDE_TOP_LAYOUT: Layout = {
  id: 'wide-top',
  name: 'Wide+4',
  columns: 4,
  rows: 3,
  gap: 4,
  cells: [
    { row: 0, col: 0, colSpan: 4 },              // slot 0: wide
    { row: 1, col: 0, rowSpan: 2, colSpan: 2 },  // slot 1: big
    { row: 1, col: 2, rowSpan: 2, colSpan: 2 },  // slot 2: big
  ],
};

// Single full-screen panel
const SINGLE_LAYOUT: Layout = {
  id: 'single',
  name: 'Single',
  columns: 1,
  rows: 1,
  gap: 0,
  cells: [
    { row: 0, col: 0 },
  ],
};

export const DEFAULT_LAYOUTS: Layout[] = [
  DEFAULT_LAYOUT, DETAIL_LAYOUT, QUAD_LAYOUT,
  BIG1_LAYOUT, GRID6_LAYOUT, WIDE_TOP_LAYOUT, SINGLE_LAYOUT,
];

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
