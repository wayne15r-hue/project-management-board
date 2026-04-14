"use client";

import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Plus, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Label } from "@/types";

export const LABEL_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6b7280",
];

interface LabelPickerProps {
  boardId: string;
  cardId: string;
  selectedLabels: Label[];
  onChange: (labels: Label[]) => void;
}

export function LabelPicker({
  boardId,
  cardId,
  selectedLabels,
  onChange,
}: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/boards/${boardId}/labels`)
      .then((r) => r.json())
      .then((data) => setLabels(data || []))
      .finally(() => setLoading(false));
  }, [open, boardId]);

  const selectedIds = useMemo(
    () => new Set(selectedLabels.map((l) => l.id)),
    [selectedLabels]
  );

  async function toggleLabel(label: Label) {
    const isSelected = selectedIds.has(label.id);
    if (isSelected) {
      onChange(selectedLabels.filter((l) => l.id !== label.id));
      try {
        await fetch(`/api/cards/${cardId}/labels`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labelId: label.id }),
        });
      } catch {
        onChange(selectedLabels);
        toast.error("Failed to remove label");
      }
    } else {
      onChange([...selectedLabels, label]);
      try {
        await fetch(`/api/cards/${cardId}/labels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labelId: label.id }),
        });
      } catch {
        onChange(selectedLabels);
        toast.error("Failed to add label");
      }
    }
  }

  async function createLabel() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) throw new Error();
      const label = await res.json();
      setLabels((prev) => [...prev, label]);
      setNewName("");
      setNewColor(LABEL_COLORS[0]);
      setCreating(false);
      // auto-assign to card
      await fetch(`/api/cards/${cardId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId: label.id }),
      });
      onChange([...selectedLabels, label]);
    } catch {
      toast.error("Failed to create label");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex min-h-7 max-w-full flex-wrap items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] hover:bg-accent">
        {selectedLabels.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            Empty
          </span>
        ) : (
          selectedLabels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${l.color}1A`, color: l.color }}
            >
              {l.name}
            </span>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-2 py-3 text-[12px] text-muted-foreground">Loading...</p>
          ) : labels.length === 0 && !creating ? (
            <p className="px-2 py-3 text-[12px] text-muted-foreground">
              No labels yet
            </p>
          ) : (
            labels.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLabel(l)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <span className="flex-1 truncate">{l.name}</span>
                {selectedIds.has(l.id) && <Check className="h-3.5 w-3.5" />}
              </button>
            ))
          )}
        </div>

        <div className="mt-1 border-t border-border pt-1">
          {creating ? (
            <div className="space-y-2 p-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Label name"
                autoFocus
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createLabel();
                }}
              />
              <div className="flex flex-wrap gap-1">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "h-5 w-5 rounded-full ring-offset-1 transition",
                      newColor === c && "ring-2 ring-foreground"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={createLabel}
                  className="flex-1 rounded-md bg-foreground px-2 py-1 text-[12px] font-medium text-background hover:bg-foreground/90"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                  className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent"
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Create label
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
