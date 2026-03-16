import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OBDConnectionState } from '@/types';

export type TirePosition = 'FL' | 'FR' | 'RL' | 'RR';

export interface TpmsSensorInfo {
  id: string;
  pressure: number;
  temperature: number;
  battery: number;
  rssi: number;
  lastSeen: number;
}

interface TpmsState {
  // Persisted
  sensorAssignments: Record<TirePosition, string | null>;
  pressureUnit: 'kPa' | 'psi' | 'bar';
  alertThreshold: number; // kPa

  // Runtime
  tpmsConnectionState: OBDConnectionState;
  isTpmsStubMode: boolean;
  discoveredSensors: TpmsSensorInfo[];

  setSensorAssignment: (position: TirePosition, sensorId: string | null) => void;
  setPressureUnit: (unit: 'kPa' | 'psi' | 'bar') => void;
  setAlertThreshold: (threshold: number) => void;
  setTpmsConnectionState: (state: OBDConnectionState) => void;
  setTpmsStubMode: (stub: boolean) => void;
  setDiscoveredSensors: (sensors: TpmsSensorInfo[]) => void;
  addOrUpdateSensor: (sensor: TpmsSensorInfo) => void;
}

export const useTpmsStore = create<TpmsState>()(
  persist(
    (set, get) => ({
      sensorAssignments: { FL: null, FR: null, RL: null, RR: null },
      pressureUnit: 'kPa',
      alertThreshold: 200,

      tpmsConnectionState: 'disconnected',
      isTpmsStubMode: false,
      discoveredSensors: [],

      setSensorAssignment: (position, sensorId) =>
        set((state) => {
          const updated = { ...state.sensorAssignments };
          // Clear this sensor from any previous position
          if (sensorId !== null) {
            for (const pos of ['FL', 'FR', 'RL', 'RR'] as TirePosition[]) {
              if (updated[pos] === sensorId) updated[pos] = null;
            }
          }
          updated[position] = sensorId;
          return { sensorAssignments: updated };
        }),
      setPressureUnit: (unit) => set({ pressureUnit: unit }),
      setAlertThreshold: (threshold) => set({ alertThreshold: threshold }),
      setTpmsConnectionState: (state) => set({ tpmsConnectionState: state }),
      setTpmsStubMode: (stub) => set({ isTpmsStubMode: stub }),
      setDiscoveredSensors: (sensors) => set({ discoveredSensors: sensors }),
      addOrUpdateSensor: (sensor) => {
        const existing = get().discoveredSensors;
        const idx = existing.findIndex((s) => s.id === sensor.id);
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = sensor;
          set({ discoveredSensors: updated });
        } else {
          set({ discoveredSensors: [...existing, sensor] });
        }
      },
    }),
    {
      name: 'obd2-tpms',
      partialize: (state) => ({
        sensorAssignments: state.sensorAssignments,
        pressureUnit: state.pressureUnit,
        alertThreshold: state.alertThreshold,
      }),
    },
  ),
);
