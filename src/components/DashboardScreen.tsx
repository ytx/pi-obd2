import { useAppStore } from '@/stores/useAppStore';

function DashboardScreen() {
  const { hostname, setScreen } = useAppStore();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-obd-dark">
      <h1 className="text-4xl font-bold text-obd-primary mb-4">
        OBD2 Dashboard
      </h1>
      <p className="text-obd-dim mb-2">
        {hostname || 'Unknown Host'}
      </p>
      <p className="text-obd-accent text-lg mb-8">
        Waiting for connection...
      </p>
      <button
        onClick={() => setScreen('settings')}
        className="px-6 py-3 bg-obd-surface text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
      >
        Settings
      </button>
    </div>
  );
}

export default DashboardScreen;
