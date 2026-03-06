import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DestinationIcon = 'home_pin' | 'map_pin_heart' | 'location_on';

export interface Destination {
  id: string;
  name: string;
  lat: number;
  lon: number;
  icon: DestinationIcon;
}

interface MapState {
  // Persisted
  destinations: Destination[];
  activeDestinationId: string | null;
  headingUp: boolean;

  // Actions
  addDestination: (dest: Omit<Destination, 'id'>) => void;
  removeDestination: (id: string) => void;
  updateDestination: (id: string, updates: Partial<Omit<Destination, 'id'>>) => void;
  setActiveDestination: (id: string | null) => void;
  setHeadingUp: (v: boolean) => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      destinations: [],
      activeDestinationId: null,
      headingUp: true,

      addDestination: (dest) => set((state) => ({
        destinations: [...state.destinations, { ...dest, id: crypto.randomUUID() }],
      })),
      removeDestination: (id) => set((state) => ({
        destinations: state.destinations.filter((d) => d.id !== id),
        activeDestinationId: state.activeDestinationId === id ? null : state.activeDestinationId,
      })),
      updateDestination: (id, updates) => set((state) => ({
        destinations: state.destinations.map((d) => d.id === id ? { ...d, ...updates } : d),
      })),
      setActiveDestination: (id) => set({ activeDestinationId: id }),
      setHeadingUp: (v) => set({ headingUp: v }),
    }),
    {
      name: 'obd2-map',
    },
  ),
);
