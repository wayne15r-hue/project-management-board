import { create } from "zustand";

interface AppStore {
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  /** Bumped to ask the active board to create a new card in its first column. */
  newCardRequestId: number;
  requestNewCard: () => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  newCardRequestId: 0,
  requestNewCard: () =>
    set((s) => ({ newCardRequestId: s.newCardRequestId + 1 })),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));
