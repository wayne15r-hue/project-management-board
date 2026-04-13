import { create } from "zustand";

interface BoardUIStore {
  activeDragCardId: string | null;
  activeDragSourceColumnId: string | null;
  setDragState: (cardId: string | null, columnId: string | null) => void;

  activeView: "kanban" | "table" | "timeline";
  setActiveView: (view: BoardUIStore["activeView"]) => void;

  filters: {
    priority: string[];
    assigneeId: string | null;
    searchQuery: string;
  };
  setFilters: (filters: Partial<BoardUIStore["filters"]>) => void;
  resetFilters: () => void;
}

const defaultFilters = {
  priority: [] as string[],
  assigneeId: null as string | null,
  searchQuery: "",
};

export const useBoardStore = create<BoardUIStore>((set) => ({
  activeDragCardId: null,
  activeDragSourceColumnId: null,
  setDragState: (cardId, columnId) =>
    set({ activeDragCardId: cardId, activeDragSourceColumnId: columnId }),

  activeView: "kanban",
  setActiveView: (view) => set({ activeView: view }),

  filters: { ...defaultFilters },
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
}));
