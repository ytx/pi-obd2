import { useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useBoardStore } from '@/stores/useBoardStore';
import { LayoutSlot } from '@/types';

const GRID_W = 64;
const GRID_H = 36;

const SLOT_COLORS = [
  'bg-blue-500/40 border-blue-400',
  'bg-green-500/40 border-green-400',
  'bg-yellow-500/40 border-yellow-400',
  'bg-purple-500/40 border-purple-400',
  'bg-pink-500/40 border-pink-400',
  'bg-cyan-500/40 border-cyan-400',
  'bg-orange-500/40 border-orange-400',
  'bg-red-500/40 border-red-400',
];

function LayoutEditorScreen() {
  const { setScreen } = useAppStore();
  const layouts = useBoardStore((s) => s.layouts);
  const addLayout = useBoardStore((s) => s.addLayout);
  const removeLayout = useBoardStore((s) => s.removeLayout);
  const updateLayout = useBoardStore((s) => s.updateLayout);
  const updateLayoutSlot = useBoardStore((s) => s.updateLayoutSlot);
  const addLayoutSlot = useBoardStore((s) => s.addLayoutSlot);
  const removeLayoutSlot = useBoardStore((s) => s.removeLayoutSlot);
  const reorderLayoutSlot = useBoardStore((s) => s.reorderLayoutSlot);
  const duplicateLayout = useBoardStore((s) => s.duplicateLayout);
  const boards = useBoardStore((s) => s.boards);

  const allLayouts = Object.values(layouts);
  const [selectedLayoutId, setSelectedLayoutId] = useState(allLayouts[0]?.id ?? '');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  const layout = layouts[selectedLayoutId] ?? null;
  const isUsedByBoard = boards.some((b) => b.layoutId === selectedLayoutId);

  const handleAddLayout = () => {
    const id = `layout-${Date.now()}`;
    const newLayout = {
      id,
      name: `Layout ${allLayouts.length + 1}`,
      slots: [{ x: 0, y: 0, w: 32, h: 18 } as LayoutSlot],
    };
    addLayout(newLayout);
    setSelectedLayoutId(id);
    setSelectedSlotIndex(null);
  };

  const handleDeleteLayout = () => {
    if (!layout || isUsedByBoard) return;
    removeLayout(selectedLayoutId);
    const remaining = Object.values(layouts).filter((l) => l.id !== selectedLayoutId);
    setSelectedLayoutId(remaining[0]?.id ?? '');
    setSelectedSlotIndex(null);
  };

  const handleDuplicate = () => {
    if (!layout) return;
    duplicateLayout(selectedLayoutId);
    // Find the new layout (it was just added)
    const newLayouts = useBoardStore.getState().layouts;
    const newest = Object.values(newLayouts).find(
      (l) => l.id !== selectedLayoutId && l.name === `${layout.name} Copy`,
    );
    if (newest) setSelectedLayoutId(newest.id);
    setSelectedSlotIndex(null);
  };

  const handleSlotFieldChange = (slotIndex: number, field: keyof LayoutSlot, value: string) => {
    if (!layout) return;
    const slot = layout.slots[slotIndex];
    if (!slot) return;
    const n = parseInt(value);
    if (isNaN(n)) return;
    const updated = { ...slot, [field]: n };
    // Clamp values
    updated.x = Math.max(0, Math.min(GRID_W - 1, updated.x));
    updated.y = Math.max(0, Math.min(GRID_H - 1, updated.y));
    updated.w = Math.max(1, Math.min(GRID_W - updated.x, updated.w));
    updated.h = Math.max(1, Math.min(GRID_H - updated.y, updated.h));
    updateLayoutSlot(selectedLayoutId, slotIndex, updated);
  };

  const handleMoveSlot = (fromIndex: number, direction: 'up' | 'down') => {
    if (!layout) return;
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= layout.slots.length) return;
    reorderLayoutSlot(selectedLayoutId, fromIndex, toIndex);
    setSelectedSlotIndex(toIndex);
  };

  return (
    <div className="h-full flex flex-col bg-obd-dark p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-bold text-white">Layout Editor</h1>
        <div className="w-20" />
      </div>

      {/* Main content: left preview + right controls */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: 16:9 Preview */}
        <div className="flex-1 flex items-center justify-center">
          {layout && (
            <div
              className="relative w-full bg-obd-surface rounded-lg border border-obd-dim/30"
              style={{ aspectRatio: '16/9', maxHeight: '100%' }}
            >
              {layout.slots.map((slot, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedSlotIndex(i)}
                  className={`absolute border-2 rounded cursor-pointer flex items-center justify-center text-xs font-bold transition-all ${
                    SLOT_COLORS[i % SLOT_COLORS.length]
                  } ${selectedSlotIndex === i ? 'ring-2 ring-white' : ''}`}
                  style={{
                    left: `${(slot.x / GRID_W) * 100}%`,
                    top: `${(slot.y / GRID_H) * 100}%`,
                    width: `${(slot.w / GRID_W) * 100}%`,
                    height: `${(slot.h / GRID_H) * 100}%`,
                  }}
                >
                  {i}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="w-72 flex flex-col gap-3 overflow-y-auto">
          {/* Layout selector */}
          <div className="bg-obd-surface rounded-lg p-3">
            <label className="text-xs text-obd-dim mb-1 block">Layout</label>
            <select
              value={selectedLayoutId}
              onChange={(e) => { setSelectedLayoutId(e.target.value); setSelectedSlotIndex(null); }}
              className="w-full px-2 py-1 bg-obd-dark text-white border border-obd-dim rounded text-sm mb-2"
            >
              {allLayouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.slots.length} slots)
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                onClick={handleAddLayout}
                className="px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600"
              >
                New
              </button>
              <button
                onClick={handleDuplicate}
                disabled={!layout}
                className="px-2 py-1 text-xs bg-obd-surface text-obd-primary border border-obd-dim rounded hover:bg-obd-dim/30 disabled:opacity-30"
              >
                Duplicate
              </button>
              <button
                onClick={handleDeleteLayout}
                disabled={!layout || isUsedByBoard || allLayouts.length <= 1}
                className="px-2 py-1 text-xs text-obd-danger border border-obd-dim rounded hover:bg-obd-dim/30 disabled:opacity-30"
                title={isUsedByBoard ? 'Used by a board' : undefined}
              >
                Delete
              </button>
            </div>
          </div>

          {/* Layout name */}
          {layout && (
            <div className="bg-obd-surface rounded-lg p-3">
              <label className="text-xs text-obd-dim mb-1 block">Name</label>
              <input
                type="text"
                value={layout.name}
                onChange={(e) => updateLayout(selectedLayoutId, { name: e.target.value })}
                className="w-full px-2 py-1 bg-obd-dark text-white border border-obd-dim rounded text-sm"
              />
            </div>
          )}

          {/* Slot list */}
          {layout && (
            <div className="bg-obd-surface rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-obd-dim">Slots</label>
                <button
                  onClick={() => addLayoutSlot(selectedLayoutId)}
                  className="px-2 py-0.5 text-xs bg-green-700 text-white rounded hover:bg-green-600"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-1">
                {layout.slots.map((slot, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedSlotIndex(i)}
                    className={`flex items-center gap-1 p-1.5 rounded cursor-pointer text-xs ${
                      selectedSlotIndex === i ? 'bg-obd-primary/20 ring-1 ring-obd-primary' : 'bg-obd-dark/50 hover:bg-obd-dark'
                    }`}
                  >
                    <span className="w-4 text-center font-bold text-obd-primary">{i}</span>
                    <span className="flex-1 text-obd-dim">
                      {slot.w}x{slot.h} @ ({slot.x},{slot.y})
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveSlot(i, 'up'); }}
                      disabled={i === 0}
                      className="px-1 text-obd-dim hover:text-white disabled:opacity-20"
                    >
                      &uarr;
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveSlot(i, 'down'); }}
                      disabled={i === layout.slots.length - 1}
                      className="px-1 text-obd-dim hover:text-white disabled:opacity-20"
                    >
                      &darr;
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayoutSlot(selectedLayoutId, i);
                        if (selectedSlotIndex === i) setSelectedSlotIndex(null);
                        else if (selectedSlotIndex !== null && selectedSlotIndex > i) setSelectedSlotIndex(selectedSlotIndex - 1);
                      }}
                      disabled={layout.slots.length <= 1}
                      className="px-1 text-obd-danger hover:text-red-400 disabled:opacity-20"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slot detail editor */}
          {layout && selectedSlotIndex !== null && layout.slots[selectedSlotIndex] && (
            <div className="bg-obd-surface rounded-lg p-3">
              <label className="text-xs text-obd-dim mb-2 block">Slot {selectedSlotIndex} Position</label>
              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map((field) => (
                  <label key={field} className="flex items-center gap-1">
                    <span className="text-xs text-obd-dim w-4 uppercase">{field}</span>
                    <input
                      type="number"
                      value={layout.slots[selectedSlotIndex!][field]}
                      onChange={(e) => handleSlotFieldChange(selectedSlotIndex!, field, e.target.value)}
                      className="flex-1 w-0 px-2 py-1 bg-obd-dark text-white border border-obd-dim rounded text-xs"
                      min={field === 'w' || field === 'h' ? 1 : 0}
                      max={field === 'x' || field === 'w' ? GRID_W : GRID_H}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LayoutEditorScreen;
