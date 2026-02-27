import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { waitForHydration } from '@/stores/hydration';
import DashboardScreen from '@/components/DashboardScreen';
import MenuScreen from '@/components/MenuScreen';
import SystemSettingsScreen from '@/components/settings/SystemSettingsScreen';
import DisplaySettingsScreen from '@/components/settings/DisplaySettingsScreen';
import LayoutEditorScreen from '@/components/settings/LayoutEditorScreen';
import DevSettingsScreen from '@/components/settings/DevSettingsScreen';

function App() {
  const { currentScreen, setHostname } = useAppStore();

  useEffect(() => {
    if (window.obd2API) {
      window.obd2API.getHostname().then(setHostname);
    }
  }, [setHostname]);

  // Restore persisted theme on startup (after hydration)
  useEffect(() => {
    waitForHydration(useThemeStore).then(() => {
      const themeId = useThemeStore.getState().currentThemeId;
      if (themeId && window.obd2API) {
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
      {currentScreen === 'layout-editor' && <LayoutEditorScreen />}
      {currentScreen === 'dev-settings' && <DevSettingsScreen />}
    </div>
  );
}

export default App;
