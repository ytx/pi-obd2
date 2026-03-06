import { OBDPidInfo } from '../obd/types';

export const GPS_PIDS: Record<string, OBDPidInfo> = {
  GPS_LAT: { id: 'GPS_LAT', name: 'Latitude', unit: 'deg', min: -90, max: 90 },
  GPS_LON: { id: 'GPS_LON', name: 'Longitude', unit: 'deg', min: -180, max: 180 },
  GPS_SPD: { id: 'GPS_SPD', name: 'GPS Speed', unit: 'km/h', min: 0, max: 300 },
  GPS_ALT: { id: 'GPS_ALT', name: 'Altitude', unit: 'm', min: -100, max: 9000 },
  GPS_HDG: { id: 'GPS_HDG', name: 'Heading', unit: 'deg', min: 0, max: 360 },
  GPS_SAT: { id: 'GPS_SAT', name: 'Satellites', unit: '', min: 0, max: 24 },
  GPS_UTC: { id: 'GPS_UTC', name: 'UTC Time', unit: 'hhmm', min: 0, max: 2400 },
};

export function getAllGpsPidInfos(): OBDPidInfo[] {
  return Object.values(GPS_PIDS).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    min: p.min,
    max: p.max,
  }));
}
