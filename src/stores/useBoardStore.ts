import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Board, BoardSlot, Layout, PanelDef } from '@/types';
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
    return state.layouts[board.layoutId] ?? DEFAULT_LAYOUTS[0];
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
        const slotCount = layout.cells.length;
        // Resize panels array: keep existing slots, add nulls or trim
        const panels: (BoardSlot | null)[] = Array.from(
          { length: slotCount },
          (_, i) => b.panels[i] ?? null,
        );
        return { ...b, layoutId, panels };
      }),
    });
  },
}),
    {
      name: 'obd2-boards',
      partialize: (state) => ({
        boards: state.boards,
        currentBoardId: state.currentBoardId,
        screenPadding: state.screenPadding,
      }),
    },
  ),
);
