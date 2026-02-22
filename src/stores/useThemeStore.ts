import { create } from 'zustand';
import { ThemeInfo, ThemeData, MeterConfig, NumericConfig } from '@/types';
import { parseTheme } from '@/canvas/theme-parser';
import { DEFAULT_METER_CONFIG, DEFAULT_NUMERIC_CONFIG } from '@/config/defaults';

interface ThemeState {
  availableThemes: ThemeInfo[];
  currentThemeId: string | null;
  currentThemeData: ThemeData | null;
  // Parsed configs from theme
  themeMeterConfig: MeterConfig;
  themeNumericConfig: NumericConfig;
  // Theme assets (data URLs)
  dialBackgroundUrl: string | null;
  displayBackgroundUrl: string | null;
  backgroundUrl: string | null;
  fontLoaded: boolean;

  setAvailableThemes: (themes: ThemeInfo[]) => void;
  applyTheme: (data: ThemeData) => void;
  clearTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  availableThemes: [],
  currentThemeId: null,
  currentThemeData: null,
  themeMeterConfig: DEFAULT_METER_CONFIG,
  themeNumericConfig: DEFAULT_NUMERIC_CONFIG,
  dialBackgroundUrl: null,
  displayBackgroundUrl: null,
  backgroundUrl: null,
  fontLoaded: false,

  setAvailableThemes: (availableThemes) => set({ availableThemes }),

  applyTheme: (data) => {
    const parsed = parseTheme(data.properties, data.assets);

    // Load custom font if available
    let fontLoaded = false;
    if (data.assets.fontBase64) {
      const fontFace = new FontFace(
        'TorqueThemeFont',
        `url(data:font/ttf;base64,${data.assets.fontBase64})`,
      );
      fontFace.load().then((loaded) => {
        document.fonts.add(loaded);
      }).catch((e) => {
        console.warn('Failed to load theme font:', e);
      });
      fontLoaded = true;
    }

    set({
      currentThemeId: data.info.id,
      currentThemeData: data,
      themeMeterConfig: parsed.meterConfig,
      themeNumericConfig: parsed.numericConfig,
      dialBackgroundUrl: data.assets.dialBackground ?? null,
      displayBackgroundUrl: data.assets.displayBackground ?? null,
      backgroundUrl: data.assets.background ?? null,
      fontLoaded,
    });
  },

  clearTheme: () =>
    set({
      currentThemeId: null,
      currentThemeData: null,
      themeMeterConfig: DEFAULT_METER_CONFIG,
      themeNumericConfig: DEFAULT_NUMERIC_CONFIG,
      dialBackgroundUrl: null,
      displayBackgroundUrl: null,
      backgroundUrl: null,
      fontLoaded: false,
    }),
}));
