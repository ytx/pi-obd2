import { create } from 'zustand';
import { ThemeInfo, ThemeData, MeterConfig, NumericConfig, GraphConfig } from '@/types';
import { parseTheme } from '@/canvas/theme-parser';
import { DEFAULT_METER_CONFIG, DEFAULT_NUMERIC_CONFIG, DEFAULT_GRAPH_CONFIG } from '@/config/defaults';

interface ThemeState {
  availableThemes: ThemeInfo[];
  currentThemeId: string | null;
  currentThemeData: ThemeData | null;
  // Parsed configs from theme
  themeMeterConfig: MeterConfig;
  themeNumericConfig: NumericConfig;
  themeGraphConfig: GraphConfig;
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
  themeGraphConfig: DEFAULT_GRAPH_CONFIG,
  dialBackgroundUrl: null,
  displayBackgroundUrl: null,
  backgroundUrl: null,
  fontLoaded: false,

  setAvailableThemes: (availableThemes) => set({ availableThemes }),

  applyTheme: (data) => {
    console.log('[Theme] Applying:', data.info.id);
    console.log('[Theme] Assets:', {
      dialBackground: data.assets.dialBackground ? `${data.assets.dialBackground.length} chars` : 'none',
      displayBackground: data.assets.displayBackground ? `${data.assets.displayBackground.length} chars` : 'none',
      background: data.assets.background ? `${data.assets.background.length} chars` : 'none',
      fontBase64: data.assets.fontBase64 ? `${data.assets.fontBase64.length} chars` : 'none',
    });
    console.log('[Theme] Properties:', data.properties);
    const parsed = parseTheme(data.properties, data.assets);

    // Set theme immediately (without font)
    set({
      currentThemeId: data.info.id,
      currentThemeData: data,
      themeMeterConfig: parsed.meterConfig,
      themeNumericConfig: parsed.numericConfig,
      themeGraphConfig: parsed.graphConfig,
      dialBackgroundUrl: data.assets.dialBackground ?? null,
      displayBackgroundUrl: data.assets.displayBackground ?? null,
      backgroundUrl: data.assets.background ?? null,
      fontLoaded: false,
    });

    // Load custom font asynchronously, set fontLoaded after completion
    if (data.assets.fontBase64) {
      const fontFace = new FontFace(
        'TorqueThemeFont',
        `url(data:font/ttf;base64,${data.assets.fontBase64})`,
      );
      fontFace.load().then((loaded) => {
        document.fonts.add(loaded);
        set({ fontLoaded: true });
      }).catch((e) => {
        console.warn('Failed to load theme font:', e);
      });
    }
  },

  clearTheme: () =>
    set({
      currentThemeId: null,
      currentThemeData: null,
      themeMeterConfig: DEFAULT_METER_CONFIG,
      themeNumericConfig: DEFAULT_NUMERIC_CONFIG,
      themeGraphConfig: DEFAULT_GRAPH_CONFIG,
      dialBackgroundUrl: null,
      displayBackgroundUrl: null,
      backgroundUrl: null,
      fontLoaded: false,
    }),
}));
