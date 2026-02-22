export type Screen = 'dashboard' | 'settings';

export interface SystemStats {
  cpuUsage: number;
  cpuTemp: number;
  memTotal: number;
  memFree: number;
  uptime: number;
}

// OBD2 types (renderer side)
export type OBDConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OBDPidInfo {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
}

export interface OBDValue {
  pid: string;
  value: number;
  timestamp: number;
}

export type SimulationPattern = 'sine' | 'random-walk' | 'fixed' | 'ramp';

export interface StubPidConfig {
  pattern: SimulationPattern;
  base?: number;
  amplitude?: number;
  period?: number;
  value?: number;
  step?: number;
  min?: number;
  max?: number;
}

export type StubProfileName = 'idle' | 'city' | 'highway';

export interface StubConfig {
  profileName: StubProfileName;
  interval: number;
  pidConfigs: Record<string, StubPidConfig>;
}

// Panel & Board types (Phase 3)
export type PanelKind = 'numeric' | 'meter' | 'graph';

export interface MeterConfig {
  startAngle: number;  // 6時基準の除外角度 (degrees)
  stopAngle: number;
  tickCount: number;
  tickInnerRadius: number;  // 0-1 倍率
  tickOuterRadius: number;
  tickColor: string;
  needleColor: string;
  needleLength: number;     // 0-1 倍率
  needleSizeRatio: number;
  textColor: string;
  valueColor: string;
  unitColor: string;
  titleOffset: number;
  valueOffset: number;
  unitOffset: number;
  scaleTextRadius: number;  // 0-1 倍率
  fontScale: number;
  hideTicks: boolean;
}

export interface GraphConfig {
  timeWindowMs: number;
  lineColor: string;
  fillColor: string;
  gridColor: string;
  textColor: string;
  lineWidth: number;
}

export interface NumericConfig {
  fontSize: number;
  valueColor: string;
  unitColor: string;
  titleColor: string;
  decimals: number;
}

export interface PanelDef {
  id: string;
  kind: PanelKind;
  pid: string;
  label?: string;
  config: MeterConfig | GraphConfig | NumericConfig;
}

export interface LayoutCell {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
}

export interface Layout {
  id: string;
  name: string;
  columns: number;
  rows: number;
  gap: number;
  cells: LayoutCell[];
}

export interface Board {
  id: string;
  name: string;
  layoutId: string;
  panels: (string | null)[];  // slot index → panelDef ID
}

// Bluetooth types (Phase 6)
export interface BTDevice {
  address: string;
  name: string;
  paired: boolean;
  connected: boolean;
  rssi?: number;
}

// WiFi types (Phase 6)
export interface WiFiNetwork {
  ssid: string;
  signal: number;
  security: string;
  connected: boolean;
}

// Theme types (Phase 4)
export interface ThemeInfo {
  id: string;
  apkFile: string;
  themeZip: string;
  name: string;
  screenshotBase64?: string;
}

export interface ThemeAssets {
  dialBackground?: string;    // base64 data URL
  displayBackground?: string; // base64 data URL
  background?: string;        // base64 data URL
  fontBase64?: string;        // base64 raw
}

export interface ThemeProperties {
  [key: string]: string;
}

export interface ThemeData {
  info: ThemeInfo;
  properties: ThemeProperties;
  assets: ThemeAssets;
}
