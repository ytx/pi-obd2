import { OBDPid } from './types';

export const OBD_PIDS: Record<string, OBDPid> = {
  '010C': {
    id: '010C',
    name: 'Engine RPM',
    unit: 'rpm',
    min: 0,
    max: 8000,
    bytes: 2,
    formula: (b) => (b[0] * 256 + b[1]) / 4,
  },
  '010D': {
    id: '010D',
    name: 'Vehicle Speed',
    unit: 'km/h',
    min: 0,
    max: 255,
    bytes: 1,
    formula: (b) => b[0],
  },
  '0105': {
    id: '0105',
    name: 'Coolant Temp',
    unit: '°C',
    min: -40,
    max: 215,
    bytes: 1,
    formula: (b) => b[0] - 40,
  },
  '0111': {
    id: '0111',
    name: 'Throttle Position',
    unit: '%',
    min: 0,
    max: 100,
    bytes: 1,
    formula: (b) => (b[0] * 100) / 255,
  },
  '010F': {
    id: '010F',
    name: 'Intake Air Temp',
    unit: '°C',
    min: -40,
    max: 215,
    bytes: 1,
    formula: (b) => b[0] - 40,
  },
  '0104': {
    id: '0104',
    name: 'Engine Load',
    unit: '%',
    min: 0,
    max: 100,
    bytes: 1,
    formula: (b) => (b[0] * 100) / 255,
  },
  '0133': {
    id: '0133',
    name: 'Barometric Pressure',
    unit: 'kPa',
    min: 0,
    max: 255,
    bytes: 1,
    formula: (b) => b[0],
  },
  '010B': {
    id: '010B',
    name: 'Intake Manifold Pressure',
    unit: 'kPa',
    min: 0,
    max: 255,
    bytes: 1,
    formula: (b) => b[0],
  },
  '012F': {
    id: '012F',
    name: 'Fuel Level',
    unit: '%',
    min: 0,
    max: 100,
    bytes: 1,
    formula: (b) => (b[0] * 100) / 255,
  },
  '0142': {
    id: '0142',
    name: 'Control Module Voltage',
    unit: 'V',
    min: 0,
    max: 65.535,
    bytes: 2,
    formula: (b) => (b[0] * 256 + b[1]) / 1000,
  },
};

export function getPidInfo(pid: string) {
  const p = OBD_PIDS[pid];
  if (!p) return null;
  return { id: p.id, name: p.name, unit: p.unit, min: p.min, max: p.max };
}

export function getAllPidInfos() {
  return Object.values(OBD_PIDS).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    min: p.min,
    max: p.max,
  }));
}
