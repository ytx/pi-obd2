import { create } from 'zustand';
import { Board, Layout, PanelDef } from '@/types';
import { DEFAULT_BOARD, DEFAULT_LAYOUT, DEFAULT_PANELS } from '@/config/defaults';

interface BoardState {
  boards: Board[];
  layouts: Record<string, Layout>;
  panelDefs: Record<string, PanelDef>;
  currentBoardId: string;

  getCurrentBoard: () => Board;
  getCurrentLayout: () => Layout;
  getPanelDef: (id: string) => PanelDef | undefined;
  setCurrentBoardId: (id: string) => void;
}

const initialPanelDefs: Record<string, PanelDef> = {};
for (const p of DEFAULT_PANELS) {
  initialPanelDefs[p.id] = p;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boards: [DEFAULT_BOARD],
  layouts: { [DEFAULT_LAYOUT.id]: DEFAULT_LAYOUT },
  panelDefs: initialPanelDefs,
  currentBoardId: DEFAULT_BOARD.id,

  getCurrentBoard: () => {
    const state = get();
    return state.boards.find((b) => b.id === state.currentBoardId) ?? state.boards[0];
  },
  getCurrentLayout: () => {
    const state = get();
    const board = state.boards.find((b) => b.id === state.currentBoardId) ?? state.boards[0];
    return state.layouts[board.layoutId] ?? DEFAULT_LAYOUT;
  },
  getPanelDef: (id: string) => get().panelDefs[id],
  setCurrentBoardId: (currentBoardId) => set({ currentBoardId }),
}));
