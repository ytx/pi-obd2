import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Board, BoardSlot, Layout, LayoutSlot, PanelDef } from '@/types';
import { DEFAULT_BOARDS, DEFAULT_LAYOUTS, DEFAULT_PANEL_DEFS, DEFAULT_SCREEN_PADDING } from '@/config/defaults';

interface BoardState {
  boards: Board[];
  layouts: Record<string, Layout>;
  panelDefs: Record<string, PanelDef>;
  currentBoardId: string;

  getCurrentBoard: () => Board;
  getCurrentLayout: () => Layout;
  getPanelDef: (id: string) => PanelDef | undefined;
  setCurrentBoardId: (id: string) => void;
  nextBoard: () => void;
  prevBoard: () => void;
  currentBoardIndex: () => number;
  updateSlot: (boardId: string, slotIndex: number, slot: BoardSlot | null) => void;
  addBoard: (board: Board) => void;
  removeBoard: (boardId: string) => void;
  renameBoard: (boardId: string, name: string) => void;
  changeBoardLayout: (boardId: string, layoutId: string) => void;
  screenPadding: number;
  setScreenPadding: (padding: number) => void;

  // Layout CRUD
  addLayout: (layout: Layout) => void;
  removeLayout: (layoutId: string) => void;
  updateLayout: (layoutId: string, updates: Partial<Pick<Layout, 'name'>>) => void;
  updateLayoutSlot: (layoutId: string, slotIndex: number, slot: LayoutSlot) => void;
  addLayoutSlot: (layoutId: string) => void;
  removeLayoutSlot: (layoutId: string, slotIndex: number) => void;
  reorderLayoutSlot: (layoutId: string, fromIndex: number, toIndex: number) => void;
  duplicateLayout: (layoutId: string) => void;
}

const initialPanelDefs: Record<string, PanelDef> = {};
for (const p of DEFAULT_PANEL_DEFS) {
  initialPanelDefs[p.id] = p;
}

const initialLayouts: Record<string, Layout> = {};
for (const l of DEFAULT_LAYOUTS) {
  initialLayouts[l.id] = l;
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
  boards: DEFAULT_BOARDS,
  layouts: initialLayouts,
  panelDefs: initialPanelDefs,
  currentBoardId: DEFAULT_BOARDS[0].id,
  screenPadding: DEFAULT_SCREEN_PADDING,

  getCurrentBoard: () => {
    const state = get();
    return state.boards.find((b) => b.id === state.currentBoardId) ?? state.boards[0];
  },
  getCurrentLayout: () => {
    const state = get();
    const board = state.boards.find((b) => b.id === state.currentBoardId) ?? state.boards[0];
    return state.layouts[board.layoutId] ?? Object.values(state.layouts)[0] ?? DEFAULT_LAYOUTS[0];
  },
  getPanelDef: (id: string) => get().panelDefs[id],
  setCurrentBoardId: (currentBoardId) => set({ currentBoardId }),

  nextBoard: () => {
    const state = get();
    const idx = state.boards.findIndex((b) => b.id === state.currentBoardId);
    const next = (idx + 1) % state.boards.length;
    set({ currentBoardId: state.boards[next].id });
  },

  prevBoard: () => {
    const state = get();
    const idx = state.boards.findIndex((b) => b.id === state.currentBoardId);
    const prev = (idx - 1 + state.boards.length) % state.boards.length;
    set({ currentBoardId: state.boards[prev].id });
  },

  currentBoardIndex: () => {
    const state = get();
    return state.boards.findIndex((b) => b.id === state.currentBoardId);
  },

  updateSlot: (boardId, slotIndex, slot) => {
    set((state) => ({
      boards: state.boards.map((b) => {
        if (b.id !== boardId) return b;
        const panels = [...b.panels];
        panels[slotIndex] = slot;
        return { ...b, panels };
      }),
    }));
  },

  addBoard: (board) => {
    set((state) => ({ boards: [...state.boards, board] }));
  },

  removeBoard: (boardId) => {
    set((state) => {
      const boards = state.boards.filter((b) => b.id !== boardId);
      if (boards.length === 0) return state;
      const currentBoardId = state.currentBoardId === boardId ? boards[0].id : state.currentBoardId;
      return { boards, currentBoardId };
    });
  },

  renameBoard: (boardId, name) => {
    set((state) => ({
      boards: state.boards.map((b) => (b.id === boardId ? { ...b, name } : b)),
    }));
  },

  setScreenPadding: (screenPadding) => set({ screenPadding }),

  changeBoardLayout: (boardId, layoutId) => {
    const state = get();
    const layout = state.layouts[layoutId];
    if (!layout) return;
    set({
      boards: state.boards.map((b) => {
        if (b.id !== boardId) return b;
        const slotCount = layout.slots.length;
        const panels: (BoardSlot | null)[] = Array.from(
          { length: slotCount },
          (_, i) => b.panels[i] ?? null,
        );
        return { ...b, layoutId, panels };
      }),
    });
  },

  // Layout CRUD
  addLayout: (layout) => {
    set((state) => ({
      layouts: { ...state.layouts, [layout.id]: layout },
    }));
  },

  removeLayout: (layoutId) => {
    const state = get();
    // Don't remove if any board references it
    if (state.boards.some((b) => b.layoutId === layoutId)) return;
    const { [layoutId]: _, ...rest } = state.layouts;
    set({ layouts: rest });
  },

  updateLayout: (layoutId, updates) => {
    set((state) => {
      const layout = state.layouts[layoutId];
      if (!layout) return state;
      return {
        layouts: { ...state.layouts, [layoutId]: { ...layout, ...updates } },
      };
    });
  },

  updateLayoutSlot: (layoutId, slotIndex, slot) => {
    set((state) => {
      const layout = state.layouts[layoutId];
      if (!layout) return state;
      const slots = [...layout.slots];
      slots[slotIndex] = slot;
      return {
        layouts: { ...state.layouts, [layoutId]: { ...layout, slots } },
      };
    });
  },

  addLayoutSlot: (layoutId) => {
    set((state) => {
      const layout = state.layouts[layoutId];
      if (!layout) return state;
      const newSlot: LayoutSlot = { x: 0, y: 0, w: 16, h: 12 };
      const newLayout = { ...layout, slots: [...layout.slots, newSlot] };
      // Also extend panels arrays for boards using this layout
      const boards = state.boards.map((b) => {
        if (b.layoutId !== layoutId) return b;
        return { ...b, panels: [...b.panels, null] };
      });
      return {
        layouts: { ...state.layouts, [layoutId]: newLayout },
        boards,
      };
    });
  },

  removeLayoutSlot: (layoutId, slotIndex) => {
    set((state) => {
      const layout = state.layouts[layoutId];
      if (!layout || layout.slots.length <= 1) return state;
      const slots = layout.slots.filter((_, i) => i !== slotIndex);
      const newLayout = { ...layout, slots };
      // Also adjust panels arrays for boards using this layout
      const boards = state.boards.map((b) => {
        if (b.layoutId !== layoutId) return b;
        const panels = b.panels.filter((_, i) => i !== slotIndex);
        return { ...b, panels };
      });
      return {
        layouts: { ...state.layouts, [layoutId]: newLayout },
        boards,
      };
    });
  },

  reorderLayoutSlot: (layoutId, fromIndex, toIndex) => {
    set((state) => {
      const layout = state.layouts[layoutId];
      if (!layout) return state;
      const slots = [...layout.slots];
      const [moved] = slots.splice(fromIndex, 1);
      slots.splice(toIndex, 0, moved);
      const newLayout = { ...layout, slots };
      // Also reorder panels arrays for boards using this layout
      const boards = state.boards.map((b) => {
        if (b.layoutId !== layoutId) return b;
        const panels = [...b.panels];
        const [movedPanel] = panels.splice(fromIndex, 1);
        panels.splice(toIndex, 0, movedPanel);
        return { ...b, panels };
      });
      return {
        layouts: { ...state.layouts, [layoutId]: newLayout },
        boards,
      };
    });
  },

  duplicateLayout: (layoutId) => {
    const state = get();
    const layout = state.layouts[layoutId];
    if (!layout) return;
    const newId = `layout-${Date.now()}`;
    const newLayout: Layout = {
      ...layout,
      id: newId,
      name: `${layout.name} Copy`,
      slots: layout.slots.map((s) => ({ ...s })),
    };
    set({
      layouts: { ...state.layouts, [newId]: newLayout },
    });
  },
}),
    {
      name: 'obd2-boards',
      version: 2,
      partialize: (state) => ({
        boards: state.boards,
        layouts: state.layouts,
        currentBoardId: state.currentBoardId,
        screenPadding: state.screenPadding,
      }),
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          // v1: layouts not persisted → inject new-format default layouts
          return { ...(persisted as Record<string, unknown>), layouts: initialLayouts };
        }
        return persisted;
      },
    },
  ),
);
