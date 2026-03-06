import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OBDConnectionState } from '@/types';

interface GpsState {
  // Persisted
  gpsDevicePath: string | null;

  // Runtime
  gpsConnectionState: OBDConnectionState;
  isGpsStubMode: boolean;

  setGpsDevicePath: (path: string | null) => void;
  setGpsConnectionState: (state: OBDConnectionState) => void;
  setGpsStubMode: (stub: boolean) => void;
}

export const useGpsStore = create<GpsState>()(
  persist(
    (set) => ({
      gpsDevicePath: null,
      gpsConnectionState: 'disconnected',
      isGpsStubMode: false,

      setGpsDevicePath: (path) => set({ gpsDevicePath: path }),
      setGpsConnectionState: (state) => set({ gpsConnectionState: state }),
      setGpsStubMode: (stub) => set({ isGpsStubMode: stub }),
    }),
    {
      name: 'obd2-gps',
      partialize: (state) => ({
        gpsDevicePath: state.gpsDevicePath,
      }),
    },
  ),
);
