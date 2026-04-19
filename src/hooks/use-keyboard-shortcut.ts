"use client";

import { useEffect } from "react";

interface Options {
  /** Lowercase key, e.g. "k", "n", "?", "Escape", "ArrowDown" */
  key: string;
  /** Require Cmd (mac) or Ctrl (other). */
  meta?: boolean;
  shift?: boolean;
  /** When true, ignore the shortcut if focus is in an input/textarea/contenteditable. */
  ignoreInInputs?: boolean;
  enabled?: boolean;
  handler: (e: KeyboardEvent) => void;
}

function isInTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcut({
  key,
  meta = false,
  shift = false,
  ignoreInInputs = true,
  enabled = true,
  handler,
}: Options) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const wantedMeta = meta && (e.metaKey || e.ctrlKey);
      if (meta && !wantedMeta) return;
      if (!meta && (e.metaKey || e.ctrlKey)) return;
      if (shift && !e.shiftKey) return;
      if (e.key?.toLowerCase() !== key.toLowerCase()) return;
      if (ignoreInInputs && isInTextField(e.target)) return;
      handler(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, meta, shift, ignoreInInputs, enabled, handler]);
}
