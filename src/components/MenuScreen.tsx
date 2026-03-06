import { useAppStore } from '@/stores/useAppStore';
import { Screen } from '@/types';

interface TileConfig {
  label: string;
  screen: Screen;
  color: string;
}

const tiles: (TileConfig | null)[] = [
  { label: 'Bluetooth', screen: 'bluetooth', color: 'bg-blue-700' },
  { label: 'OBD2', screen: 'obd2', color: 'bg-green-700' },
  { label: 'Display', screen: 'display-settings', color: 'bg-indigo-700' },
  { label: 'Layout', screen: 'layout-editor', color: 'bg-purple-700' },
  { label: 'Theme', screen: 'theme-editor', color: 'bg-amber-700' },
  { label: 'System', screen: 'system-settings', color: 'bg-teal-700' },
  { label: 'Dev', screen: 'dev-settings', color: 'bg-gray-700' },
  { label: 'DTCs', screen: 'dtc', color: 'bg-red-700' },
  null, null,
  null, null, null, null, null,
  null, null, null, null, null,
];

function MenuScreen() {
  const { setScreen } = useAppStore();

  return (
    <div
      className="h-full bg-obd-dark flex items-center justify-center"
      onClick={(e) => {
        // Background tap → back to dashboard
        if (e.target === e.currentTarget) setScreen('dashboard');
      }}
    >
      <div className="grid grid-cols-5 grid-rows-4 gap-4 w-[700px] h-[420px]">
        {tiles.map((tile, i) => {
          if (!tile) {
            return (
              <div
                key={i}
                className="rounded-lg bg-obd-surface/20 border border-obd-dim/10"
              />
            );
          }
          return (
            <button
              key={i}
              onClick={() => setScreen(tile.screen)}
              className={`${tile.color} rounded-lg flex items-center justify-center text-white text-lg font-semibold hover:brightness-125 transition-all active:scale-95`}
            >
              {tile.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MenuScreen;
