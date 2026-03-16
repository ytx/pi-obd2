import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useBoardStore } from '@/stores/useBoardStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { useGpsStore } from '@/stores/useGpsStore';
import { useGpioStore } from '@/stores/useGpioStore';
import { usePidConfigStore } from '@/stores/usePidConfigStore';
import { useMapStore } from '@/stores/useMapStore';
import { waitForHydration } from '@/stores/hydration';
import { useConfigAutoSave } from '@/hooks/useConfigAutoSave';
import DashboardScreen from '@/components/DashboardScreen';
import MenuScreen from '@/components/MenuScreen';
import SystemSettingsScreen from '@/components/settings/SystemSettingsScreen';
import DisplaySettingsScreen from '@/components/settings/DisplaySettingsScreen';
import LayoutEditorScreen from '@/components/settings/LayoutEditorScreen';
import DevSettingsScreen from '@/components/settings/DevSettingsScreen';
import ThemeEditorScreen from '@/components/settings/ThemeEditorScreen';
import BluetoothScreen from '@/components/settings/BluetoothScreen';
import OBD2Screen from '@/components/settings/OBD2Screen';
import DtcScreen from '@/components/settings/DtcScreen';
import BoardSettingsScreen from '@/components/settings/BoardSettingsScreen';
import GpsScreen from '@/components/settings/GpsScreen';
import ValuesScreen from '@/components/settings/ValuesScreen';
import AboutScreen from '@/components/settings/AboutScreen';
import TerminalScreen from '@/components/settings/TerminalScreen';
import WiFiScreen from '@/components/settings/WiFiScreen';
import GpioScreen from '@/components/settings/GpioScreen';
import DestinationScreen from '@/components/settings/DestinationScreen';

function App() {
  const { currentScreen, setHostname } = useAppStore();

  // Auto-save config to USB on store changes (5s debounce)
  useConfigAutoSave();

  useEffect(() => {
    if (window.obd2API) {
      window.obd2API.getHostname().then(setHostname);
    }
  }, [setHostname]);

  // Load USB config at startup → override localStorage stores, then restore theme
  useEffect(() => {
    if (!window.obd2API) return;

    // Wait for all persisted stores to hydrate from localStorage first
    Promise.all([
      waitForHydration(useBoardStore),
      waitForHydration(useThemeStore),
      waitForHydration(useOBDStore),
      waitForHydration(useGpsStore),
      waitForHydration(useGpioStore),
      waitForHydration(usePidConfigStore),
      waitForHydration(useMapStore),
    ]).then(async () => {
      // Try loading USB config (overrides localStorage values)
      const config = await window.obd2API.configLoad();
      if (config) {
        const c = config as Record<string, unknown>;
        // Apply USB config to stores
        const boardState = useBoardStore.getState();
        if (Array.isArray(c.boards) && c.boards.length > 0) {
          // Use setState to batch-update board store
          useBoardStore.setState({
            boards: c.boards as typeof boardState.boards,
            layouts: (c.layouts as typeof boardState.layouts) ?? boardState.layouts,
            currentBoardId: (c.currentBoardId as string) || boardState.currentBoardId,
            screenPadding: (c.screenPadding as number) ?? boardState.screenPadding,
          });
        }
        if (c.obdDevicePath !== undefined) {
          useOBDStore.getState().setObdDevicePath(c.obdDevicePath as string | null);
        }
        if (c.gpsDevicePath !== undefined) {
          useGpsStore.getState().setGpsDevicePath(c.gpsDevicePath as string | null);
        }
        if (c.gpio && typeof c.gpio === 'object') {
          const g = c.gpio as Record<string, unknown>;
          const gs = useGpioStore.getState();
          if (g.illuminationPin !== undefined) gs.setIlluminationPin(g.illuminationPin as number | null);
          if (g.reversePin !== undefined) gs.setReversePin(g.reversePin as number | null);
          if (g.illuminationActiveHigh !== undefined) gs.setIlluminationActiveHigh(g.illuminationActiveHigh as boolean);
          if (g.reverseActiveHigh !== undefined) gs.setReverseActiveHigh(g.reverseActiveHigh as boolean);
          if (g.illuminationThemeId !== undefined) gs.setIlluminationThemeId(g.illuminationThemeId as string | null);
          if (g.reverseBoardId !== undefined) gs.setReverseBoardId(g.reverseBoardId as string | null);
          if (g.usbResetPin !== undefined) gs.setUsbResetPin(g.usbResetPin as number | null);
        }
        if (c.pidConfig && typeof c.pidConfig === 'object') {
          const pidConfigs = c.pidConfig as Record<string, { name?: string; unit?: string; min?: number; max?: number; use?: boolean }>;
          for (const [pid, cfg] of Object.entries(pidConfigs)) {
            usePidConfigStore.getState().setConfig(pid, cfg);
          }
        }
        if (Array.isArray(c.destinations)) {
          useMapStore.setState({
            destinations: c.destinations as import('@/stores/useMapStore').Destination[],
            activeDestinationId: (c.activeDestinationId as string) ?? null,
            headingUp: (c.headingUp as boolean) ?? useMapStore.getState().headingUp,
          });
        }
        // Theme from USB config
        const themeId = c.currentThemeId as string | null;
        if (themeId) {
          useThemeStore.setState({ currentThemeId: themeId });
        }
      }

      // Restore theme (from USB config or localStorage)
      const themeId = useThemeStore.getState().currentThemeId;
      if (themeId) {
        window.obd2API.themeLoad(themeId).then((data: unknown) => {
          if (data) {
            useThemeStore.getState().applyTheme(data as import('@/types').ThemeData);
          }
        }).catch((e: unknown) => {
          console.warn('Failed to restore theme:', e);
        });
      }
    });
  }, []);

  return (
    <div className="h-screen w-screen">
      {currentScreen === 'dashboard' && <DashboardScreen />}
      {currentScreen === 'menu' && <MenuScreen />}
      {currentScreen === 'system-settings' && <SystemSettingsScreen />}
      {currentScreen === 'display-settings' && <DisplaySettingsScreen />}
      {currentScreen === 'board-settings' && <BoardSettingsScreen />}
      {currentScreen === 'layout-editor' && <LayoutEditorScreen />}
      {currentScreen === 'dev-settings' && <DevSettingsScreen />}
      {currentScreen === 'theme-editor' && <ThemeEditorScreen />}
      {currentScreen === 'bluetooth' && <BluetoothScreen />}
      {currentScreen === 'obd2' && <OBD2Screen />}
      {currentScreen === 'dtc' && <DtcScreen />}
      {currentScreen === 'gps' && <GpsScreen />}
      {currentScreen === 'values' && <ValuesScreen />}
      {currentScreen === 'about' && <AboutScreen />}
      {currentScreen === 'terminal' && <TerminalScreen />}
      {currentScreen === 'wifi' && <WiFiScreen />}
      {currentScreen === 'gpio' && <GpioScreen />}
      {currentScreen === 'destination' && <DestinationScreen />}
    </div>
  );
}

export default App;
