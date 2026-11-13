"use client";

import { Menu } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

export function MobileSidebarToggle() {
  const open = useAppStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  return (
    <button
      type="button"
      id="workspace-menu-trigger"
      onClick={() => setMobileOpen(true)}
      aria-label="Open sidebar"
      aria-haspopup="dialog"
      aria-expanded={open}
      className="inline-flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-accent md:hidden"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
