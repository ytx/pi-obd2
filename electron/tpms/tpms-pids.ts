import { OBDPidInfo } from '../obd/types';

export const TPMS_PIDS: Record<string, OBDPidInfo> = {
  TPMS_FL_P: { id: 'TPMS_FL_P', name: 'FL Pressure', unit: 'kPa', min: 0, max: 400 },
  TPMS_FR_P: { id: 'TPMS_FR_P', name: 'FR Pressure', unit: 'kPa', min: 0, max: 400 },
  TPMS_RL_P: { id: 'TPMS_RL_P', name: 'RL Pressure', unit: 'kPa', min: 0, max: 400 },
  TPMS_RR_P: { id: 'TPMS_RR_P', name: 'RR Pressure', unit: 'kPa', min: 0, max: 400 },
  TPMS_FL_T: { id: 'TPMS_FL_T', name: 'FL Tire Temp', unit: '°C', min: -40, max: 120 },
  TPMS_FR_T: { id: 'TPMS_FR_T', name: 'FR Tire Temp', unit: '°C', min: -40, max: 120 },
  TPMS_RL_T: { id: 'TPMS_RL_T', name: 'RL Tire Temp', unit: '°C', min: -40, max: 120 },
  TPMS_RR_T: { id: 'TPMS_RR_T', name: 'RR Tire Temp', unit: '°C', min: -40, max: 120 },
  TPMS_FL_B: { id: 'TPMS_FL_B', name: 'FL Battery', unit: 'V', min: 0, max: 4 },
  TPMS_FR_B: { id: 'TPMS_FR_B', name: 'FR Battery', unit: 'V', min: 0, max: 4 },
  TPMS_RL_B: { id: 'TPMS_RL_B', name: 'RL Battery', unit: 'V', min: 0, max: 4 },
  TPMS_RR_B: { id: 'TPMS_RR_B', name: 'RR Battery', unit: 'V', min: 0, max: 4 },
};

export function getAllTpmsPidInfos(): OBDPidInfo[] {
  return Object.values(TPMS_PIDS).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    min: p.min,
    max: p.max,
  }));
}
