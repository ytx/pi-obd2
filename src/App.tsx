import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import DashboardScreen from '@/components/DashboardScreen';
import SystemSettingsScreen from '@/components/settings/SystemSettingsScreen';
import DisplaySettingsScreen from '@/components/settings/DisplaySettingsScreen';
import DevSettingsScreen from '@/components/settings/DevSettingsScreen';

function App() {
  const { currentScreen, setHostname } = useAppStore();

  useEffect(() => {
    if (window.obd2API) {
      window.obd2API.getHostname().then(setHostname);
    }
  }, [setHostname]);

  return (
    <div className="h-screen w-screen">
      {currentScreen === 'dashboard' && <DashboardScreen />}
      {currentScreen === 'system-settings' && <SystemSettingsScreen />}
      {currentScreen === 'display-settings' && <DisplaySettingsScreen />}
      {currentScreen === 'dev-settings' && <DevSettingsScreen />}
    </div>
  );
}

export default App;
