import { create } from 'zustand';
import { OBDConnectionState, OBDValue, OBDPidInfo, StubProfileName } from '@/types';

interface OBDState {
  connectionState: OBDConnectionState;
  currentValues: Record<string, OBDValue>;
  pollingPids: string[];
  isStubMode: boolean;
  availablePids: OBDPidInfo[];
  currentProfile: StubProfileName;
  profiles: string[];

  setConnectionState: (state: OBDConnectionState) => void;
  updateValues: (values: OBDValue[]) => void;
  setPollingPids: (pids: string[]) => void;
  setStubMode: (isStub: boolean) => void;
  setAvailablePids: (pids: OBDPidInfo[]) => void;
  setCurrentProfile: (profile: StubProfileName) => void;
  setProfiles: (profiles: string[]) => void;
}

export const useOBDStore = create<OBDState>((set) => ({
  connectionState: 'disconnected',
  currentValues: {},
  pollingPids: [],
  isStubMode: true,
  availablePids: [],
  currentProfile: 'idle',
  profiles: [],

  setConnectionState: (connectionState) => set({ connectionState }),
  updateValues: (values) =>
    set((state) => {
      const newValues = { ...state.currentValues };
      for (const v of values) {
        newValues[v.pid] = v;
      }
      return { currentValues: newValues };
    }),
  setPollingPids: (pollingPids) => set({ pollingPids }),
  setStubMode: (isStubMode) => set({ isStubMode }),
  setAvailablePids: (availablePids) => set({ availablePids }),
  setCurrentProfile: (currentProfile) => set({ currentProfile }),
  setProfiles: (profiles) => set({ profiles }),
}));
