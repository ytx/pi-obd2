import { create } from 'zustand';
import { Screen, SystemStats } from '@/types';

interface AppState {
  currentScreen: Screen;
  hostname: string;
  systemStats: SystemStats | null;

  setScreen: (screen: Screen) => void;
  setHostname: (hostname: string) => void;
  setSystemStats: (stats: SystemStats) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentScreen: 'dashboard',
  hostname: '',
  systemStats: null,

  setScreen: (screen) => set({ currentScreen: screen }),
  setHostname: (hostname) => set({ hostname }),
  setSystemStats: (stats) => set({ systemStats: stats }),
}));
