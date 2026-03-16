import { TpmsSource, TpmsSensorInfo, TirePosition } from './tpms-source';
import { OBDValue, OBDConnectionState } from '../obd/types';
import { logger } from '../logger';

const DJTPMS_SERVICE_UUID = '27a5';
const ATMOSPHERIC_PRESSURE_KPA = 101;
const POSITIONS: TirePosition[] = ['FL', 'FR', 'RL', 'RR'];

// CRC8 lookup table (polynomial 0x07)
const CRC8_TABLE: number[] = [];
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  CRC8_TABLE[i] = crc;
}

function crc8(data: Buffer, start: number, length: number): number {
  let crc = 0;
  for (let i = start; i < start + length; i++) {
    crc = CRC8_TABLE[(crc ^ data[i]) & 0xff];
  }
  return crc;
}

export class BleTpmsSource implements TpmsSource {
  private state: OBDConnectionState = 'disconnected';
  private generation = 0;
  private sensors: Map<string, TpmsSensorInfo> = new Map();
  private assignments: Record<TirePosition, string | null> = { FL: null, FR: null, RL: null, RR: null };
  private dataCallbacks: ((values: OBDValue[]) => void)[] = [];
  private connectionCallbacks: ((state: OBDConnectionState) => void)[] = [];
  private sensorCallbacks: ((sensor: TpmsSensorInfo) => void)[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private noble: any = null;
  private discoverHandler: ((peripheral: unknown) => void) | null = null;

  async connect(): Promise<void> {
    const gen = ++this.generation;
    if (this.state === 'connected') {
      await this.disconnect();
    }
    this.setState('connecting');

    try {
      // Dynamic import to avoid crash if noble is not available
      const nobleModule = await import('@abandonware/noble');
      this.noble = nobleModule.default ?? nobleModule;

      if (gen !== this.generation) return;

      // Wait for BLE adapter to be powered on
      await this.waitForPoweredOn(gen);
      if (gen !== this.generation) return;

      // Setup discover handler
      this.discoverHandler = (peripheral: unknown) => {
        if (gen !== this.generation) return;
        this.handlePeripheral(peripheral);
      };
      this.noble.on('discover', this.discoverHandler);

      // Start scanning with no service UUID filter — DJTPMS sensors may not advertise
      // the service UUID in the standard list; we identify them by manufacturerData structure
      await this.noble.startScanningAsync([], true);
      if (gen !== this.generation) return;

      logger.info('tpms', 'BLE scanning started');
      this.setState('connected');
    } catch (err) {
      if (gen !== this.generation) return;
      logger.error('tpms', `BLE connect failed: ${err}`);
      this.setState('error');
    }
  }

  async disconnect(): Promise<void> {
    ++this.generation;
    try {
      if (this.noble) {
        if (this.discoverHandler) {
          this.noble.removeListener('discover', this.discoverHandler);
          this.discoverHandler = null;
        }
        await this.noble.stopScanningAsync();
      }
    } catch (err) {
      logger.warn('tpms', `BLE stop scanning error: ${err}`);
    }
    this.setState('disconnected');
  }

  getState(): OBDConnectionState {
    return this.state;
  }

  onData(callback: (values: OBDValue[]) => void): void {
    this.dataCallbacks.push(callback);
  }

  onConnectionChange(callback: (state: OBDConnectionState) => void): void {
    this.connectionCallbacks.push(callback);
  }

  onSensorDiscovered(callback: (sensor: TpmsSensorInfo) => void): void {
    this.sensorCallbacks.push(callback);
  }

  getSensors(): TpmsSensorInfo[] {
    return Array.from(this.sensors.values());
  }

  assignSensor(sensorId: string, position: TirePosition): void {
    for (const pos of POSITIONS) {
      if (this.assignments[pos] === sensorId) {
        this.assignments[pos] = null;
      }
    }
    this.assignments[position] = sensorId;
  }

  unassignSensor(position: TirePosition): void {
    this.assignments[position] = null;
  }

  getAssignments(): Record<TirePosition, string | null> {
    return { ...this.assignments };
  }

  setAssignments(assignments: Record<TirePosition, string | null>): void {
    this.assignments = { ...assignments };
  }

  dispose(): void {
    ++this.generation;
    try {
      if (this.noble) {
        if (this.discoverHandler) {
          this.noble.removeListener('discover', this.discoverHandler);
          this.discoverHandler = null;
        }
        this.noble.stopScanning();
      }
    } catch { /* best-effort */ }
    this.dataCallbacks = [];
    this.connectionCallbacks = [];
    this.sensorCallbacks = [];
  }

  // --- Internal ---

  private setState(state: OBDConnectionState): void {
    this.state = state;
    for (const cb of this.connectionCallbacks) cb(state);
  }

  private waitForPoweredOn(gen: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.noble) { reject(new Error('noble not loaded')); return; }
      if (this.noble.state === 'poweredOn') { resolve(); return; }

      const timeout = setTimeout(() => {
        reject(new Error('BLE adapter not powered on within 10s'));
      }, 10000);

      const onStateChange = (s: string) => {
        if (gen !== this.generation) { clearTimeout(timeout); reject(new Error('cancelled')); return; }
        if (s === 'poweredOn') {
          clearTimeout(timeout);
          this.noble?.removeListener('stateChange', onStateChange);
          resolve();
        }
      };
      this.noble.on('stateChange', onStateChange);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private discoveryLogCount = 0;

  private handlePeripheral(peripheral: any): void {
    const advertisement = peripheral.advertisement;
    if (!advertisement) return;

    const uuid: string = peripheral.uuid || peripheral.id || '';

    // DJTPMS sends data in manufacturerData within BLE advertisements
    const manufacturerData: Buffer | undefined = advertisement.manufacturerData;

    // Debug: always log peripherals matching TPMS MAC prefix, or first 50 with manufacturerData
    const isTpmsCandidate = uuid.startsWith('0c3d5e');
    if (isTpmsCandidate) {
      const name = advertisement.localName || '(no name)';
      const svcs = (advertisement.serviceUuids || []).join(',');
      const svcData = advertisement.serviceData ? JSON.stringify(advertisement.serviceData.map((s: any) => ({ uuid: s.uuid, data: s.data?.toString('hex') }))) : 'none';
      const mfr = manufacturerData ? manufacturerData.toString('hex') : 'none';
      logger.info('tpms', `TPMS candidate: uuid=${uuid} name=${name} svcs=[${svcs}] svcData=${svcData} mfr=${mfr} mfrLen=${manufacturerData?.length ?? 0} rssi=${peripheral.rssi}`);
    } else if (this.discoveryLogCount < 50 && manufacturerData) {
      this.discoveryLogCount++;
      if (this.discoveryLogCount <= 5 || this.discoveryLogCount % 10 === 0) {
        const name = advertisement.localName || '(no name)';
        logger.info('tpms', `BLE peripheral #${this.discoveryLogCount}: uuid=${uuid} name=${name} mfr=${manufacturerData.toString('hex')} len=${manufacturerData.length} rssi=${peripheral.rssi}`);
      }
    }

    if (!manufacturerData || manufacturerData.length < 8) return;

    // Filter: only parse DJTPMS sensors (by name or service UUID ffe0)
    const name = advertisement.localName || '';
    const serviceUuids: string[] = advertisement.serviceUuids || [];
    const isDjtpms = name === 'DJTPMS' || serviceUuids.includes('ffe0') || serviceUuids.includes(DJTPMS_SERVICE_UUID);
    if (!isDjtpms) return;

    const parsed = this.parsePayload(manufacturerData);
    if (!parsed) return;

    const sensorId = peripheral.uuid || peripheral.id;
    const now = Date.now();

    const sensor: TpmsSensorInfo = {
      id: sensorId,
      pressure: parsed.pressure,
      temperature: parsed.temperature,
      battery: parsed.battery,
      rssi: peripheral.rssi ?? -100,
      lastSeen: now,
    };

    const isNew = !this.sensors.has(sensorId);
    this.sensors.set(sensorId, sensor);

    // Notify sensor discovered
    for (const cb of this.sensorCallbacks) cb(sensor);

    if (isNew) {
      logger.info('tpms', `Sensor discovered: ${sensorId} P=${parsed.pressure}kPa T=${parsed.temperature}°C`);
    }

    // Emit OBDValues for assigned positions
    const values: OBDValue[] = [];
    for (const pos of POSITIONS) {
      if (this.assignments[pos] === sensorId) {
        values.push(
          { pid: `TPMS_${pos}_P`, value: parsed.pressure, timestamp: now },
          { pid: `TPMS_${pos}_T`, value: parsed.temperature, timestamp: now },
          { pid: `TPMS_${pos}_B`, value: parsed.battery, timestamp: now },
        );
      }
    }

    if (values.length > 0) {
      for (const cb of this.dataCallbacks) cb(values);
    }
  }

  private parsePayload(data: Buffer): { battery: number; temperature: number; pressure: number } | null {
    // DJTPMS manufacturerData (14 bytes observed):
    // [0-1] Company ID (variable, ignored)
    // [2]   Battery voltage: VV / 10.0 V
    // [3]   Temperature: int8 °C
    // [4-5] Absolute pressure: BE uint16 kPa
    // [6]   Flags
    // [7]   Checksum (format varies by firmware — not validated)
    // [8-13] MAC address (optional, present in 14-byte variant)
    if (data.length < 8) return null;

    const battery = data[2] / 10.0;
    // int8 for temperature
    const temperature = data[3] > 127 ? data[3] - 256 : data[3];
    const absolutePressure = data.readUInt16BE(4);
    const gaugePressure = absolutePressure - ATMOSPHERIC_PRESSURE_KPA;

    // Sanity checks
    if (battery < 0 || battery > 5) return null;
    if (temperature < -40 || temperature > 120) return null;
    if (gaugePressure < -50 || gaugePressure > 500) return null;

    return { battery, temperature, pressure: gaugePressure };
  }
}
