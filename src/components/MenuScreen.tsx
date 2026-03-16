import { useAppStore } from '@/stores/useAppStore';
import { Screen } from '@/types';

interface TileConfig {
  label: string;
  icon: string;
  screen: Screen;
  color: string;
}

const tiles: (TileConfig | null)[] = [
  // Row 1
  { label: 'Values', icon: 'list', screen: 'values', color: 'bg-emerald-700' },
  { label: 'DTCs', icon: 'car_crash', screen: 'dtc', color: 'bg-red-700' },
  { label: 'Destination', icon: 'pin_drop', screen: 'destination', color: 'bg-rose-700' },
  { label: 'TPMS', icon: 'tire_repair', screen: 'tpms', color: 'bg-amber-700' },
  null,
  // Row 2
  { label: 'OBD2', icon: 'browse_activity', screen: 'obd2', color: 'bg-green-700' },
  { label: 'GPS', icon: 'satellite_alt', screen: 'gps', color: 'bg-cyan-700' },
  { label: 'GPIO', icon: 'cable', screen: 'gpio', color: 'bg-orange-700' },
  { label: 'Bluetooth', icon: 'settings_bluetooth', screen: 'bluetooth', color: 'bg-blue-700' },
  { label: 'WiFi', icon: 'wifi', screen: 'wifi', color: 'bg-sky-700' },
  // Row 3
  { label: 'Display', icon: 'display_settings', screen: 'display-settings', color: 'bg-indigo-700' },
  { label: 'Board', icon: 'select_window_2', screen: 'board-settings', color: 'bg-violet-700' },
  null,
  { label: 'Layout', icon: 'dashboard_2_edit', screen: 'layout-editor', color: 'bg-purple-700' },
  { label: 'Theme', icon: 'wall_art', screen: 'theme-editor', color: 'bg-amber-700' },
  // Row 4
  { label: 'System', icon: 'settings', screen: 'system-settings', color: 'bg-teal-700' },
  null,
  { label: 'Terminal', icon: 'terminal', screen: 'terminal', color: 'bg-zinc-700' },
  { label: 'Dev', icon: 'logo_dev', screen: 'dev-settings', color: 'bg-gray-700' },
  { label: 'About', icon: 'info', screen: 'about', color: 'bg-slate-700' },
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
              className={`${tile.color} rounded-lg flex flex-col items-center justify-center gap-1 text-white hover:brightness-125 transition-all active:scale-95`}
            >
              <span className="material-symbols-outlined text-3xl">{tile.icon}</span>
              <span className="text-sm font-semibold">{tile.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MenuScreen;
