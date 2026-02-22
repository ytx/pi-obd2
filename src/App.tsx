import { useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import DashboardScreen from '@/components/DashboardScreen';
import SettingsScreen from '@/components/SettingsScreen';

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
      {currentScreen === 'settings' && <SettingsScreen />}
    </div>
  );
}

export default App;
