import { MeterConfig, GraphConfig, NumericConfig, PanelDef, Layout, LayoutSlot, Board } from '@/types';

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
  scaleTextRadius: 0.75,
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

// 64x36 grid layouts (16:9)
const s = (x: number, y: number, w: number, h: number): LayoutSlot => ({ x, y, w, h });

export const DEFAULT_LAYOUT: Layout = {
  id: 'default',
  name: 'Default',
  slots: [s(0,0,32,24), s(32,0,32,24), s(0,24,32,12), s(32,24,16,12), s(48,24,16,12)],
};

const DETAIL_LAYOUT: Layout = {
  id: 'detail',
  name: '1+4+Wide',
  slots: [s(0,0,32,24), s(32,0,16,12), s(48,0,16,12), s(32,12,16,12), s(48,12,16,12), s(0,24,64,12)],
};

const QUAD_LAYOUT: Layout = {
  id: 'quad',
  name: '2x2',
  slots: [s(0,0,32,18), s(32,0,32,18), s(0,18,32,18), s(32,18,32,18)],
};

const BIG1_LAYOUT: Layout = {
  id: 'big1',
  name: '1+3',
  slots: [s(0,0,32,36), s(32,0,32,18), s(32,18,16,18), s(48,18,16,18)],
};

const GRID6_LAYOUT: Layout = {
  id: 'grid6',
  name: '3x2',
  slots: [s(0,0,21,18), s(21,0,22,18), s(43,0,21,18), s(0,18,21,18), s(21,18,22,18), s(43,18,21,18)],
};

const WIDE_TOP_LAYOUT: Layout = {
  id: 'wide-top',
  name: 'Wide+4',
  slots: [s(0,0,64,12), s(0,12,32,24), s(32,12,32,24)],
};

const SINGLE_LAYOUT: Layout = {
  id: 'single',
  name: 'Single',
  slots: [s(0,0,64,36)],
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

export const DEFAULT_SCREEN_PADDING = 0;
