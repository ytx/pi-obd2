import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PidUserConfig {
  name?: string;
  unit?: string;
  min?: number;
  max?: number;
  use?: boolean; // undefined = true
}

interface PidConfigState {
  configs: Record<string, PidUserConfig>;
  setConfig: (pid: string, config: PidUserConfig) => void;
  resetConfig: (pid: string) => void;
}

export const usePidConfigStore = create<PidConfigState>()(
  persist(
    (set) => ({
      configs: {},

      setConfig: (pid, config) =>
        set((state) => {
          // Remove keys that are undefined to keep storage clean
          const cleaned: PidUserConfig = {};
          if (config.name !== undefined) cleaned.name = config.name;
          if (config.unit !== undefined) cleaned.unit = config.unit;
          if (config.min !== undefined) cleaned.min = config.min;
          if (config.max !== undefined) cleaned.max = config.max;
          if (config.use !== undefined) cleaned.use = config.use;
          return { configs: { ...state.configs, [pid]: cleaned } };
        }),

      resetConfig: (pid) =>
        set((state) => {
          const { [pid]: _, ...rest } = state.configs;
          return { configs: rest };
        }),
    }),
    {
      name: 'obd2-pid-config',
      partialize: (state) => ({ configs: state.configs }),
    },
  ),
);
