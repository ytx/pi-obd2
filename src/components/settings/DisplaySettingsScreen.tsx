import { useAppStore } from '@/stores/useAppStore';
import { useBoardStore } from '@/stores/useBoardStore';
import BoardEditSection from '@/components/settings/BoardEditSection';
import ThemeSection from '@/components/settings/ThemeSection';

function DisplaySettingsScreen() {
  const { setScreen } = useAppStore();
  const { screenPadding, setScreenPadding } = useBoardStore();

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">Display Settings</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        {/* Screen Padding */}
        <section className="bg-obd-panel rounded-lg p-4">
          <h2 className="text-lg font-semibold text-white mb-3">Screen Padding</h2>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={50}
              value={screenPadding}
              onChange={(e) => setScreenPadding(Number(e.target.value))}
              className="flex-1 accent-obd-primary"
            />
            <span className="text-white font-mono w-16 text-right">{screenPadding} px</span>
          </div>
        </section>

        <ThemeSection />
        <BoardEditSection />
      </div>
    </div>
  );
}

export default DisplaySettingsScreen;
