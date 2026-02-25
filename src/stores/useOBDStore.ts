import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OBDConnectionState, OBDValue, OBDPidInfo, StubProfileName } from '@/types';
import { getSharedBuffer } from '@/canvas/time-buffer';

interface OBDState {
  connectionState: OBDConnectionState;
  currentValues: Record<string, OBDValue>;
  pollingPids: string[];
  isStubMode: boolean;
  availablePids: OBDPidInfo[];
  currentProfile: StubProfileName;
  profiles: string[];
  obdBtAddress: string | null;

  setConnectionState: (state: OBDConnectionState) => void;
  updateValues: (values: OBDValue[]) => void;
  setPollingPids: (pids: string[]) => void;
  setStubMode: (isStub: boolean) => void;
  setAvailablePids: (pids: OBDPidInfo[]) => void;
  setCurrentProfile: (profile: StubProfileName) => void;
  setProfiles: (profiles: string[]) => void;
  setObdBtAddress: (address: string | null) => void;
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
      obdBtAddress: null,

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
      setObdBtAddress: (obdBtAddress) => set({ obdBtAddress }),
    }),
    {
      name: 'obd2-bt',
      partialize: (state) => ({ obdBtAddress: state.obdBtAddress }),
    },
  ),
);
