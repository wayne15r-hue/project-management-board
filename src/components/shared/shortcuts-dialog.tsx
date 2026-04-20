"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: { section: string; items: Shortcut[] }[] = [
  {
    section: "Global",
    items: [
      { keys: ["⌘", "K"], label: "Focus search" },
      { keys: ["?"], label: "Show this dialog" },
      { keys: ["⌘", "/"], label: "Toggle sidebar" },
      { keys: ["Esc"], label: "Close dialog or cancel" },
    ],
  },
  {
    section: "Navigation",
    items: [
      { keys: ["G", "B"], label: "Go to boards" },
      { keys: ["G", "T"], label: "Go to teams" },
    ],
  },
  {
    section: "Board",
    items: [
      { keys: ["N"], label: "New card in first column" },
      { keys: ["F"], label: "Open filters" },
      { keys: ["S"], label: "Open sort" },
      { keys: ["1"], label: "Switch to Board view" },
      { keys: ["2"], label: "Switch to Table view" },
      { keys: ["3"], label: "Switch to Timeline view" },
      { keys: ["4"], label: "Switch to Calendar view" },
      { keys: ["5"], label: "Switch to Analytics view" },
    ],
  },
  {
    section: "Card detail",
    items: [
      { keys: ["E"], label: "Edit title" },
      { keys: ["D"], label: "Delete card" },
      { keys: ["↑"], label: "Previous card" },
      { keys: ["↓"], label: "Next card" },
      { keys: ["Esc"], label: "Close card" },
    ],
  },
];

export function ShortcutsDialog() {
  const open = useAppStore((s) => s.shortcutsOpen);
  const setOpen = useAppStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to move faster.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 pt-2 sm:grid-cols-2">
          {SHORTCUTS.map((group) => (
            <div key={group.section}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.section}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 text-[13px]"
                  >
                    <span className="text-foreground">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              then
                            </span>
                          )}
                          <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-muted px-1.5 text-[11px] font-medium text-foreground shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.4)]">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
