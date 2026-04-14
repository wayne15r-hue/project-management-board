"use client";

import { Menu } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

export function MobileSidebarToggle() {
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  return (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-label="Open sidebar"
      className="fixed left-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm md:hidden"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
