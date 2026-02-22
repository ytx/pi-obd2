import { useState } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { PanelKind } from '@/types';

function BoardEditSection() {
  const boards = useBoardStore((s) => s.boards);
  const layouts = useBoardStore((s) => s.layouts);
  const panelDefs = useBoardStore((s) => s.panelDefs);
  const updatePanelInBoard = useBoardStore((s) => s.updatePanelInBoard);
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id ?? '');

  const selectedBoard = boards.find((b) => b.id === selectedBoardId);
  const layout = selectedBoard ? layouts[selectedBoard.layoutId] : null;
  const availablePids = useOBDStore((s) => s.availablePids);
  const allPanelDefs = Object.values(panelDefs);

  const kindLabel: Record<PanelKind, string> = {
    meter: 'Meter',
    graph: 'Graph',
    numeric: 'Numeric',
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <h2 className="text-lg font-semibold text-obd-primary mb-3">Board Editor</h2>

      {/* Board selector */}
      <div className="mb-4">
        <label className="text-sm text-obd-dim block mb-1">Board</label>
        <div className="flex gap-2">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBoardId(b.id)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                selectedBoardId === b.id
                  ? 'bg-obd-primary text-obd-dark font-bold'
                  : 'bg-obd-dark text-obd-dim border border-obd-dim hover:bg-obd-dim/30'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Panel slots */}
      {selectedBoard && layout && (
        <div className="space-y-2">
          <label className="text-sm text-obd-dim block">Panel Slots</label>
          {layout.cells.map((cell, slotIndex) => {
            const panelId = selectedBoard.panels[slotIndex];
            const panel = panelId ? panelDefs[panelId] : null;
            const span = `${cell.colSpan ?? 1}x${cell.rowSpan ?? 1}`;

            return (
              <div key={slotIndex} className="flex items-center gap-2 bg-obd-dark rounded p-2">
                <span className="text-xs text-obd-dim w-8">#{slotIndex}</span>
                <span className="text-xs text-obd-dim w-10">{span}</span>
                <select
                  value={panelId ?? ''}
                  onChange={(e) => updatePanelInBoard(selectedBoard.id, slotIndex, e.target.value || null)}
                  className="flex-1 px-2 py-1 text-sm bg-obd-surface text-white border border-obd-dim rounded"
                >
                  <option value="">-- empty --</option>
                  {allPanelDefs.map((pd) => {
                    const pidInfo = availablePids.find((p) => p.id === pd.pid);
                    return (
                      <option key={pd.id} value={pd.id}>
                        {kindLabel[pd.kind]}: {pd.label ?? pidInfo?.name ?? pd.pid}
                      </option>
                    );
                  })}
                </select>
                {panel && (
                  <span className="text-xs text-obd-accent">{kindLabel[panel.kind]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BoardEditSection;
