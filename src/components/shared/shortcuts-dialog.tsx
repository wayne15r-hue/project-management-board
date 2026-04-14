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
    section: "Navigation",
    items: [
      { keys: ["⌘", "K"], label: "Focus search" },
      { keys: ["⌘", "N"], label: "New card in first column" },
      { keys: ["?"], label: "Show this dialog" },
      { keys: ["Esc"], label: "Close dialog or cancel" },
    ],
  },
  {
    section: "Card detail",
    items: [
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to move faster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {SHORTCUTS.map((group) => (
            <div key={group.section}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.section}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="text-foreground">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {k}
                        </kbd>
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
