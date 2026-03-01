export type Screen = 'dashboard' | 'menu' | 'system-settings' | 'display-settings' | 'layout-editor' | 'dev-settings' | 'theme-editor' | 'bluetooth' | 'obd2';

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
export type MeterType = 'needle' | 'arc';

export interface MeterConfig {
  meterType: MeterType;
  startAngle: number;  // 6時基準の除外角度 (degrees)
  stopAngle: number;
  tickCount: number;
  tickInnerRadius: number;  // 0-1 倍率 (ティック位置、Torque dialTickInnerRadius)
  tickOuterRadius: number;  // 0-1 倍率 (ティック位置、Torque dialTickOuterRadius)
  tickColor: string;
  arcInnerRadius: number;   // 0-1 倍率 (dialMeter バリューアーク内径)
  arcOuterRadius: number;   // 0-1 倍率 (dialMeter バリューアーク外径)
  arcColor: string;         // バリューアーク色 (displayIndicatorColour)
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
  valueFontScale: number;   // dialMeterValueFontScale / dialNeedleValueFontScale
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
  config: MeterConfig | GraphConfig | NumericConfig;
}

export interface BoardSlot {
  panelDefId: string;  // display template
  pid: string;         // data source
  // Per-slot overrides (undefined = use PID defaults)
  title?: string;
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  step?: number;         // meter: scale step count
  timeWindowMs?: number; // graph: time window in ms
}

export interface LayoutSlot {
  x: number;  // 0-63
  y: number;  // 0-35
  w: number;  // 1-64
  h: number;  // 1-36
}

export interface Layout {
  id: string;
  name: string;
  slots: LayoutSlot[];  // z-order = array order (later = on top)
}

export interface Board {
  id: string;
  name: string;
  layoutId: string;
  panels: (BoardSlot | null)[];  // slot index → display + data
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

// USB types
export interface UsbDevice {
  device: string;
  size: string;
  mountpoint: string | null;
}

export interface UsbResult {
  success: boolean;
  mountpoint?: string;
  error?: string;
}

// Serial device types
export interface SerialDevice {
  path: string;        // e.g. '/dev/rfcomm0', '/dev/ttyUSB0'
  type: 'rfcomm' | 'ttyUSB' | 'ttyACM' | 'ttyS' | 'ttyOBD2';
}

// GPIO types
export interface GpioChangeEvent {
  pin: number;
  value: number;
}

// Theme types (Phase 4)
export interface ThemeInfo {
  id: string;
  name: string;
  screenshotBase64?: string;
}

export interface ThemeAssets {
  dialBackground?: string;    // base64 data URL
  displayBackground?: string; // base64 data URL
  background?: string;        // base64 data URL
  needle?: string;            // base64 data URL (480x480, needle pointing 12 o'clock)
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
