import { useBoardStore } from '@/stores/useBoardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import PanelSlot from '@/components/panels/PanelSlot';

function BoardView() {
  const board = useBoardStore((s) => s.getCurrentBoard());
  const layout = useBoardStore((s) => s.getCurrentLayout());
  const backgroundUrl = useThemeStore((s) => s.backgroundUrl);

  return (
    <div
      className="w-full h-full bg-cover bg-center"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: `${layout.gap}px`,
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
      }}
    >
      {layout.cells.map((cell, i) => (
        <div
          key={i}
          style={{
            gridRow: `${cell.row + 1} / span ${cell.rowSpan ?? 1}`,
            gridColumn: `${cell.col + 1} / span ${cell.colSpan ?? 1}`,
          }}
        >
          <PanelSlot panelDefId={board.panels[i] ?? null} />
        </div>
      ))}
    </div>
  );
}

export default BoardView;
