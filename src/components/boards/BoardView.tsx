import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import PanelSlot from '@/components/panels/PanelSlot';

function BoardView() {
  const board = useBoardStore((s) => s.getCurrentBoard());
  const layout = useBoardStore((s) => s.getCurrentLayout());
  const backgroundUrl = useThemeStore((s) => s.backgroundUrl);

  // Key on board+layout to force full re-render when switching boards
  const gridKey = `${board.id}-${layout.id}`;

  return (
    <div
      key={gridKey}
      className="relative w-full h-full"
      style={{
        aspectRatio: '16/9',
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {layout.slots.map((slot, i) => (
        <div
          key={`${gridKey}-${i}`}
          style={{
            position: 'absolute',
            left: `${(slot.x / 64) * 100}%`,
            top: `${(slot.y / 36) * 100}%`,
            width: `${(slot.w / 64) * 100}%`,
            height: `${(slot.h / 36) * 100}%`,
          }}
        >
          <PanelSlot slot={board.panels[i] ?? null} />
        </div>
      ))}
    </div>
  );
}

export default BoardView;
