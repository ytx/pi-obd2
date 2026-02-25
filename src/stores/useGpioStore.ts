import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GpioState {
  // Persisted settings
  illuminationPin: number | null;
  reversePin: number | null;
  illuminationThemeId: string | null;
  reverseBoardId: string | null;

  // Runtime state (not persisted)
  illuminationActive: boolean;
  reverseActive: boolean;

  setIlluminationPin: (pin: number | null) => void;
  setReversePin: (pin: number | null) => void;
  setIlluminationThemeId: (themeId: string | null) => void;
  setReverseBoardId: (boardId: string | null) => void;
  setIlluminationActive: (active: boolean) => void;
  setReverseActive: (active: boolean) => void;
}

export const useGpioStore = create<GpioState>()(
  persist(
    (set) => ({
      illuminationPin: 17,
      reversePin: 27,
      illuminationThemeId: null,
      reverseBoardId: null,
      illuminationActive: false,
      reverseActive: false,

      setIlluminationPin: (pin) => set({ illuminationPin: pin }),
      setReversePin: (pin) => set({ reversePin: pin }),
      setIlluminationThemeId: (themeId) => set({ illuminationThemeId: themeId }),
      setReverseBoardId: (boardId) => set({ reverseBoardId: boardId }),
      setIlluminationActive: (active) => set({ illuminationActive: active }),
      setReverseActive: (active) => set({ reverseActive: active }),
    }),
    {
      name: 'obd2-gpio',
      partialize: (state) => ({
        illuminationPin: state.illuminationPin,
        reversePin: state.reversePin,
        illuminationThemeId: state.illuminationThemeId,
        reverseBoardId: state.reverseBoardId,
      }),
    },
  ),
);
