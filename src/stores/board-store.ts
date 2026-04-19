import { create } from "zustand";

export type FilterField = "status" | "priority" | "assignee" | "due_date" | "label";
export type FilterOp =
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after";

export interface ViewFilter {
  id: string;
  field: FilterField;
  op: FilterOp;
  value?: string | null;
}

export type SortField = "title" | "priority" | "due_date" | "created_at";
export type SortDir = "asc" | "desc";

export interface ViewSort {
  id: string;
  field: SortField;
  dir: SortDir;
}

interface BoardUIStore {
  activeDragCardId: string | null;
  activeDragSourceColumnId: string | null;
  setDragState: (cardId: string | null, columnId: string | null) => void;

  activeView: "kanban" | "table" | "timeline";
  setActiveView: (view: BoardUIStore["activeView"]) => void;

  search: string;
  setSearch: (q: string) => void;

  filters: ViewFilter[];
  addFilter: (filter: ViewFilter) => void;
  updateFilter: (id: string, patch: Partial<ViewFilter>) => void;
  removeFilter: (id: string) => void;
  clearFilters: () => void;

  sorts: ViewSort[];
  addSort: (sort: ViewSort) => void;
  updateSort: (id: string, patch: Partial<ViewSort>) => void;
  removeSort: (id: string) => void;
  clearSorts: () => void;

  hydrate: (state: {
    search?: string;
    filters?: ViewFilter[];
    sorts?: ViewSort[];
  }) => void;
}

export const useBoardStore = create<BoardUIStore>((set) => ({
  activeDragCardId: null,
  activeDragSourceColumnId: null,
  setDragState: (cardId, columnId) =>
    set({ activeDragCardId: cardId, activeDragSourceColumnId: columnId }),

  activeView: "kanban",
  setActiveView: (view) => set({ activeView: view }),

  search: "",
  setSearch: (q) => set({ search: q }),

  filters: [],
  addFilter: (filter) =>
    set((state) => ({ filters: [...state.filters, filter] })),
  updateFilter: (id, patch) =>
    set((state) => ({
      filters: state.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  removeFilter: (id) =>
    set((state) => ({ filters: state.filters.filter((f) => f.id !== id) })),
  clearFilters: () => set({ filters: [] }),

  sorts: [],
  addSort: (sort) => set((state) => ({ sorts: [...state.sorts, sort] })),
  updateSort: (id, patch) =>
    set((state) => ({
      sorts: state.sorts.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),
  removeSort: (id) =>
    set((state) => ({ sorts: state.sorts.filter((s) => s.id !== id) })),
  clearSorts: () => set({ sorts: [] }),

  hydrate: ({ search, filters, sorts }) =>
    set((state) => ({
      search: search ?? state.search,
      filters: filters ?? state.filters,
      sorts: sorts ?? state.sorts,
    })),
}));
