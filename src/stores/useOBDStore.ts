import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OBDConnectionState, OBDValue, OBDPidInfo, StubProfileName } from '@/types';
import { getSharedBuffer } from '@/canvas/time-buffer';

export const OBD_BAUD_RATES = [9600, 38400, 57600, 115200, 230400, 500000] as const;
export const DEFAULT_OBD_BAUD_RATE = 38400;

interface OBDState {
  connectionState: OBDConnectionState;
  currentValues: Record<string, OBDValue>;
  pollingPids: string[];
  isStubMode: boolean;
  availablePids: OBDPidInfo[];
  currentProfile: StubProfileName;
  profiles: string[];
  obdDevicePath: string | null;
  obdBaudRate: number;

  setConnectionState: (state: OBDConnectionState) => void;
  updateValues: (values: OBDValue[]) => void;
  setPollingPids: (pids: string[]) => void;
  setStubMode: (isStub: boolean) => void;
  setAvailablePids: (pids: OBDPidInfo[]) => void;
  setCurrentProfile: (profile: StubProfileName) => void;
  setProfiles: (profiles: string[]) => void;
  setObdDevicePath: (path: string | null) => void;
  setObdBaudRate: (rate: number) => void;
}

export const useOBDStore = create<OBDState>()(
  persist(
    (set) => ({
      connectionState: 'disconnected',
      currentValues: {},
      pollingPids: [],
      isStubMode: true,
      availablePids: [],
      currentProfile: 'idle',
      profiles: [],
      obdDevicePath: null,
      obdBaudRate: DEFAULT_OBD_BAUD_RATE,

      setConnectionState: (connectionState) => set({ connectionState }),
      updateValues: (values) =>
        set((state) => {
          const newValues = { ...state.currentValues };
          for (const v of values) {
            newValues[v.pid] = v;
            // Push to shared TimeBuffer so graph history accumulates even when not displayed
            getSharedBuffer(v.pid).push(v.value, v.timestamp);
          }
          return { currentValues: newValues };
        }),
      setPollingPids: (pollingPids) => set({ pollingPids }),
      setStubMode: (isStubMode) => set({ isStubMode }),
      setAvailablePids: (availablePids) => set({ availablePids }),
      setCurrentProfile: (currentProfile) => set({ currentProfile }),
      setProfiles: (profiles) => set({ profiles }),
      setObdDevicePath: (obdDevicePath) => set({ obdDevicePath }),
      setObdBaudRate: (obdBaudRate) => set({ obdBaudRate }),
    }),
    {
      name: 'obd2-bt',
      partialize: (state) => ({
        obdDevicePath: state.obdDevicePath,
        obdBaudRate: state.obdBaudRate,
      }),
    },
  ),
);
