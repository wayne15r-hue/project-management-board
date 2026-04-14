"use client";

import { useCallback } from "react";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useAppStore } from "@/stores/app-store";

export function GlobalShortcuts() {
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const requestNewCard = useAppStore((s) => s.requestNewCard);

  // ? — show shortcuts (no meta, allowed even when no input is focused)
  useKeyboardShortcut({
    key: "?",
    handler: useCallback(
      (e) => {
        e.preventDefault();
        setShortcutsOpen(true);
      },
      [setShortcutsOpen]
    ),
  });

  // Cmd/Ctrl + N — new card
  useKeyboardShortcut({
    key: "n",
    meta: true,
    ignoreInInputs: true,
    handler: useCallback(
      (e) => {
        e.preventDefault();
        requestNewCard();
      },
      [requestNewCard]
    ),
  });

  return null;
}
