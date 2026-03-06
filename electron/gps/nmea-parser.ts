/** NMEA 0183 sentence parser — pure functions, no state. */

export interface NmeaRmc {
  utcTime: number;   // hhmm as number (e.g. 1435 = 14:35)
  valid: boolean;
  lat: number;       // decimal degrees (+ north, - south)
  lon: number;       // decimal degrees (+ east, - west)
  speedKmh: number;  // speed over ground in km/h
  heading: number;   // course over ground in degrees (0-360)
}

export interface NmeaGga {
  fixQuality: number;  // 0=no fix, 1=GPS, 2=DGPS, ...
  satellites: number;
  altitude: number;    // meters above mean sea level
}

const KNOTS_TO_KMH = 1.852;

/** Verify NMEA checksum: XOR of all chars between '$' and '*'. */
export function verifyChecksum(sentence: string): boolean {
  const starIdx = sentence.indexOf('*');
  if (starIdx === -1 || sentence[0] !== '$') return false;
  const payload = sentence.substring(1, starIdx);
  let xor = 0;
  for (let i = 0; i < payload.length; i++) {
    xor ^= payload.charCodeAt(i);
  }
  const expected = sentence.substring(starIdx + 1, starIdx + 3).toUpperCase();
  const actual = xor.toString(16).toUpperCase().padStart(2, '0');
  return expected === actual;
}

/** Convert NMEA coordinate (DDMM.MMMMM) + direction (N/S/E/W) to decimal degrees. */
export function nmeaToDecimal(coord: string, dir: string): number {
  if (!coord || !dir) return 0;
  // Latitude: DDMM.MMMMM (2-digit degree), Longitude: DDDMM.MMMMM (3-digit degree)
  const dotIdx = coord.indexOf('.');
  if (dotIdx === -1) return 0;
  const degLen = dotIdx - 2; // 2 for lat, 3 for lon
  if (degLen < 2 || degLen > 3) return 0;
  const degrees = parseInt(coord.substring(0, degLen), 10);
  const minutes = parseFloat(coord.substring(degLen));
  if (isNaN(degrees) || isNaN(minutes)) return 0;
  let decimal = degrees + minutes / 60;
  if (dir === 'S' || dir === 'W') decimal = -decimal;
  return decimal;
}

/**
 * Parse $GPRMC / $GNRMC sentence.
 * Format: $GPRMC,hhmmss.ss,A,ddmm.mmmmm,N,dddmm.mmmmm,E,knots,course,ddmmyy,...*cs
 */
export function parseRmc(sentence: string): NmeaRmc | null {
  if (!verifyChecksum(sentence)) return null;
  const body = sentence.substring(0, sentence.indexOf('*'));
  const fields = body.split(',');
  const type = fields[0];
  if (type !== '$GPRMC' && type !== '$GNRMC') return null;
  if (fields.length < 8) return null;

  const valid = fields[2] === 'A';
  const timeStr = fields[1];
  const utcTime = timeStr.length >= 4
    ? parseInt(timeStr.substring(0, 2), 10) * 100 + parseInt(timeStr.substring(2, 4), 10)
    : 0;

  const lat = nmeaToDecimal(fields[3], fields[4]);
  const lon = nmeaToDecimal(fields[5], fields[6]);
  const speedKnots = parseFloat(fields[7]) || 0;
  const heading = parseFloat(fields[8]) || 0;

  return {
    utcTime,
    valid,
    lat,
    lon,
    speedKmh: speedKnots * KNOTS_TO_KMH,
    heading,
  };
}

/**
 * Parse $GPGGA / $GNGGA sentence.
 * Format: $GPGGA,hhmmss.ss,ddmm.mmmmm,N,dddmm.mmmmm,E,q,numSats,hdop,alt,M,...*cs
 */
export function parseGga(sentence: string): NmeaGga | null {
  if (!verifyChecksum(sentence)) return null;
  const body = sentence.substring(0, sentence.indexOf('*'));
  const fields = body.split(',');
  const type = fields[0];
  if (type !== '$GPGGA' && type !== '$GNGGA') return null;
  if (fields.length < 10) return null;

  return {
    fixQuality: parseInt(fields[6], 10) || 0,
    satellites: parseInt(fields[7], 10) || 0,
    altitude: parseFloat(fields[9]) || 0,
  };
}
