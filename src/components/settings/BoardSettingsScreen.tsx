import { useAppStore } from '@/stores/useAppStore';
import BoardEditSection from '@/components/settings/BoardEditSection';

function BoardSettingsScreen() {
  const { setScreen } = useAppStore();

  return (
    <div className="h-full flex flex-col bg-obd-dark p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">Board</h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 overflow-auto space-y-4">
        <BoardEditSection />
      </div>
    </div>
  );
}

export default BoardSettingsScreen;
