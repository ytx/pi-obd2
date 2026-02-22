import { useState } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { BoardSlot } from '@/types';

function BoardEditSection() {
  const boards = useBoardStore((s) => s.boards);
  const layouts = useBoardStore((s) => s.layouts);
  const panelDefs = useBoardStore((s) => s.panelDefs);
  const updateSlot = useBoardStore((s) => s.updateSlot);
  const addBoard = useBoardStore((s) => s.addBoard);
  const removeBoard = useBoardStore((s) => s.removeBoard);
  const renameBoard = useBoardStore((s) => s.renameBoard);
  const changeBoardLayout = useBoardStore((s) => s.changeBoardLayout);
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id ?? '');
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const selectedBoard = boards.find((b) => b.id === selectedBoardId);
  const layout = selectedBoard ? layouts[selectedBoard.layoutId] : null;
  const availablePids = useOBDStore((s) => s.availablePids);
  const allPanelDefs = Object.values(panelDefs);
  const allLayouts = Object.values(layouts);

  const handleAddBoard = () => {
    const id = `board-${Date.now()}`;
    const layoutId = allLayouts[0]?.id ?? 'default';
    const ly = layouts[layoutId];
    const panels: (BoardSlot | null)[] = Array.from({ length: ly?.cells.length ?? 0 }, () => null);
    addBoard({ id, name: `Board ${boards.length + 1}`, layoutId, panels });
    setSelectedBoardId(id);
    setEditingSlot(null);
  };

  const handleDeleteBoard = () => {
    if (!selectedBoard || boards.length <= 1) return;
    const nextId = boards.find((b) => b.id !== selectedBoard.id)?.id ?? '';
    removeBoard(selectedBoard.id);
    setSelectedBoardId(nextId);
    setEditingSlot(null);
  };

  const startRename = () => {
    if (!selectedBoard) return;
    setRenameValue(selectedBoard.name);
    setRenamingBoard(true);
  };

  const commitRename = () => {
    if (selectedBoard && renameValue.trim()) {
      renameBoard(selectedBoard.id, renameValue.trim());
    }
    setRenamingBoard(false);
  };

  const handleLayoutChange = (layoutId: string) => {
    if (!selectedBoard) return;
    changeBoardLayout(selectedBoard.id, layoutId);
    setEditingSlot(null);
  };

  const updateField = (slotIndex: number, field: string, value: string) => {
    if (!selectedBoard) return;
    const slot = selectedBoard.panels[slotIndex];
    if (!slot) return;
    const updated: BoardSlot = { ...slot };

    switch (field) {
      case 'title':
        updated.title = value || undefined;
        break;
      case 'unit':
        updated.unit = value || undefined;
        break;
      case 'min': {
        const n = parseFloat(value);
        updated.min = isNaN(n) ? undefined : n;
        break;
      }
      case 'max': {
        const n = parseFloat(value);
        updated.max = isNaN(n) ? undefined : n;
        break;
      }
      case 'decimals': {
        const n = parseInt(value);
        updated.decimals = isNaN(n) ? undefined : n;
        break;
      }
      case 'step': {
        const n = parseInt(value);
        updated.step = isNaN(n) ? undefined : n;
        break;
      }
      case 'timeWindowMs': {
        const n = parseFloat(value);
        updated.timeWindowMs = isNaN(n) ? undefined : n * 1000; // input in seconds
        break;
      }
    }
    updateSlot(selectedBoard.id, slotIndex, updated);
  };

  return (
    <div className="bg-obd-surface rounded-lg p-4">
      <h2 className="text-lg font-semibold text-obd-primary mb-3">Board Editor</h2>

      {/* Board selector + management */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex gap-1 flex-1 flex-wrap">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => { setSelectedBoardId(b.id); setEditingSlot(null); setRenamingBoard(false); }}
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
          <button
            onClick={handleAddBoard}
            className="px-2 py-1 text-sm bg-green-700 text-white rounded hover:bg-green-600 transition-colors"
            title="Add board"
          >
            +
          </button>
        </div>

        {/* Board actions: rename, layout, delete */}
        {selectedBoard && (
          <div className="flex items-center gap-2 text-xs">
            {/* Rename */}
            {renamingBoard ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingBoard(false); }}
                  className="w-32 px-2 py-1 bg-obd-dark text-white border border-obd-dim rounded"
                  autoFocus
                />
                <button onClick={commitRename} className="px-2 py-1 bg-obd-primary text-obd-dark rounded">OK</button>
                <button onClick={() => setRenamingBoard(false)} className="px-2 py-1 text-obd-dim">Cancel</button>
              </div>
            ) : (
              <button onClick={startRename} className="px-2 py-1 text-obd-dim hover:text-white transition-colors">
                Rename
              </button>
            )}
            <span className="text-obd-dim">|</span>
            {/* Layout selector */}
            <label className="flex items-center gap-1">
              <span className="text-obd-dim">Layout:</span>
              <select
                value={selectedBoard.layoutId}
                onChange={(e) => handleLayoutChange(e.target.value)}
                className="px-2 py-1 bg-obd-dark text-white border border-obd-dim rounded"
              >
                {allLayouts.map((ly) => (
                  <option key={ly.id} value={ly.id}>
                    {ly.name} ({ly.cells.length} slots)
                  </option>
                ))}
              </select>
            </label>
            <span className="text-obd-dim">|</span>
            {/* Delete */}
            <button
              onClick={handleDeleteBoard}
              disabled={boards.length <= 1}
              className="px-2 py-1 text-obd-danger hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Layout preview mini-grid */}
      {selectedBoard && layout && (
        <div
          className="mb-3 h-16 rounded overflow-hidden border border-obd-dim/30"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
            gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
            gap: '2px',
          }}
        >
          {layout.cells.map((cell, i) => {
            const slot = selectedBoard.panels[i];
            return (
              <div
                key={i}
                className={`rounded-sm flex items-center justify-center text-[9px] ${
                  slot ? 'bg-obd-primary/20 text-obd-primary' : 'bg-obd-dark/50 text-obd-dim'
                }`}
                style={{
                  gridRow: `${cell.row + 1} / span ${cell.rowSpan ?? 1}`,
                  gridColumn: `${cell.col + 1} / span ${cell.colSpan ?? 1}`,
                }}
              >
                {i}
              </div>
            );
          })}
        </div>
      )}

      {/* Panel slots */}
      {selectedBoard && layout && (
        <div className="space-y-1">
          {layout.cells.map((cell, slotIndex) => {
            const slot = selectedBoard.panels[slotIndex];
            const span = `${cell.colSpan ?? 1}x${cell.rowSpan ?? 1}`;
            const panelDef = slot ? panelDefs[slot.panelDefId] : null;
            const pidInfo = slot ? availablePids.find((p) => p.id === slot.pid) : null;
            const isEditing = editingSlot === slotIndex;

            return (
              <div key={slotIndex}>
                {/* Slot row */}
                <div className="flex items-center gap-2 bg-obd-dark rounded p-2">
                  <span className="text-xs text-obd-dim w-8">#{slotIndex}</span>
                  <span className="text-xs text-obd-dim w-10">{span}</span>
                  {/* Display type */}
                  <select
                    value={slot?.panelDefId ?? ''}
                    onChange={(e) => {
                      const defId = e.target.value;
                      if (!defId) {
                        updateSlot(selectedBoard.id, slotIndex, null);
                      } else {
                        updateSlot(selectedBoard.id, slotIndex, {
                          ...(slot ?? {}),
                          panelDefId: defId,
                          pid: slot?.pid ?? availablePids[0]?.id ?? '',
                        });
                      }
                    }}
                    className="w-24 px-1 py-1 text-xs bg-obd-surface text-white border border-obd-dim rounded"
                  >
                    <option value="">--</option>
                    {allPanelDefs.map((pd) => (
                      <option key={pd.id} value={pd.id}>
                        {pd.id}
                      </option>
                    ))}
                  </select>
                  {/* PID selector */}
                  {slot && (
                    <select
                      value={slot.pid}
                      onChange={(e) =>
                        updateSlot(selectedBoard.id, slotIndex, { ...slot, pid: e.target.value })
                      }
                      className="flex-1 px-1 py-1 text-xs bg-obd-surface text-white border border-obd-dim rounded"
                    >
                      {availablePids.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.unit})
                        </option>
                      ))}
                    </select>
                  )}
                  {/* Edit toggle */}
                  {slot && (
                    <button
                      onClick={() => setEditingSlot(isEditing ? null : slotIndex)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        isEditing
                          ? 'bg-obd-primary text-obd-dark'
                          : 'bg-obd-surface text-obd-dim border border-obd-dim'
                      }`}
                    >
                      {isEditing ? 'Done' : 'Edit'}
                    </button>
                  )}
                </div>

                {/* Detail editor */}
                {isEditing && slot && panelDef && (
                  <div className="ml-8 mt-1 mb-2 p-2 bg-obd-dark/50 rounded space-y-2 text-xs">
                    {/* Common: Title, Unit */}
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1 flex-1">
                        <span className="text-obd-dim w-12">Title</span>
                        <input
                          type="text"
                          placeholder={pidInfo?.name ?? ''}
                          value={slot.title ?? ''}
                          onChange={(e) => updateField(slotIndex, 'title', e.target.value)}
                          className="flex-1 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                        />
                      </label>
                      <label className="flex items-center gap-1 w-32">
                        <span className="text-obd-dim w-10">Unit</span>
                        <input
                          type="text"
                          placeholder={pidInfo?.unit ?? ''}
                          value={slot.unit ?? ''}
                          onChange={(e) => updateField(slotIndex, 'unit', e.target.value)}
                          className="flex-1 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                        />
                      </label>
                    </div>

                    {/* Meter & Graph: Min, Max */}
                    {(panelDef.kind === 'meter' || panelDef.kind === 'graph') && (
                      <div className="flex gap-2">
                        <label className="flex items-center gap-1 flex-1">
                          <span className="text-obd-dim w-12">Min</span>
                          <input
                            type="number"
                            placeholder={String(pidInfo?.min ?? 0)}
                            value={slot.min ?? ''}
                            onChange={(e) => updateField(slotIndex, 'min', e.target.value)}
                            className="flex-1 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                          />
                        </label>
                        <label className="flex items-center gap-1 flex-1">
                          <span className="text-obd-dim w-12">Max</span>
                          <input
                            type="number"
                            placeholder={String(pidInfo?.max ?? 100)}
                            value={slot.max ?? ''}
                            onChange={(e) => updateField(slotIndex, 'max', e.target.value)}
                            className="flex-1 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                          />
                        </label>
                      </div>
                    )}

                    {/* Meter: Step */}
                    {panelDef.kind === 'meter' && (
                      <label className="flex items-center gap-1">
                        <span className="text-obd-dim w-12">Ticks</span>
                        <input
                          type="number"
                          placeholder="20"
                          value={slot.step ?? ''}
                          onChange={(e) => updateField(slotIndex, 'step', e.target.value)}
                          className="w-20 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                        />
                        <span className="text-obd-dim ml-1">divisions</span>
                      </label>
                    )}

                    {/* Numeric & Meter: Decimals */}
                    {(panelDef.kind === 'numeric' || panelDef.kind === 'meter') && (
                      <label className="flex items-center gap-1">
                        <span className="text-obd-dim w-12">Digits</span>
                        <select
                          value={slot.decimals ?? ''}
                          onChange={(e) => updateField(slotIndex, 'decimals', e.target.value)}
                          className="w-20 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                        >
                          <option value="">auto</option>
                          <option value="0">0</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                        </select>
                        <span className="text-obd-dim ml-1">decimal places</span>
                      </label>
                    )}

                    {/* Graph: Time window */}
                    {panelDef.kind === 'graph' && (
                      <label className="flex items-center gap-1">
                        <span className="text-obd-dim w-12">Time</span>
                        <input
                          type="number"
                          placeholder="30"
                          value={slot.timeWindowMs ? slot.timeWindowMs / 1000 : ''}
                          onChange={(e) => updateField(slotIndex, 'timeWindowMs', e.target.value)}
                          className="w-20 px-2 py-1 bg-obd-surface text-white border border-obd-dim rounded"
                        />
                        <span className="text-obd-dim ml-1">seconds</span>
                      </label>
                    )}
                  </div>
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
