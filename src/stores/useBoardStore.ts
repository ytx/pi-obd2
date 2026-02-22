import { create } from 'zustand';
import { Board, Layout, PanelDef } from '@/types';
import { DEFAULT_BOARDS, DEFAULT_LAYOUTS, DEFAULT_ALL_PANELS } from '@/config/defaults';

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
}

const initialPanelDefs: Record<string, PanelDef> = {};
for (const p of DEFAULT_ALL_PANELS) {
  initialPanelDefs[p.id] = p;
}

const initialLayouts: Record<string, Layout> = {};
for (const l of DEFAULT_LAYOUTS) {
  initialLayouts[l.id] = l;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boards: DEFAULT_BOARDS,
  layouts: initialLayouts,
  panelDefs: initialPanelDefs,
  currentBoardId: DEFAULT_BOARDS[0].id,

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
}));
