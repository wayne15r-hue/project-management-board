"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Subtask } from "@/types";

interface SubtasksProps {
  cardId: string;
}

export function Subtasks({ cardId }: SubtasksProps) {
  const [items, setItems] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/cards/${cardId}/subtasks`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const completed = items.filter((s) => s.completed).length;
  const total = items.length;
  const progress = total === 0 ? 0 : (completed / total) * 100;

  async function addSubtask() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    try {
      const res = await fetch(`/api/cards/${cardId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setItems((prev) => [...prev, created]);
    } catch {
      toast.error("Failed to add subtask");
    }
  }

  async function toggleSubtask(s: Subtask) {
    const next = !s.completed;
    setItems((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, completed: next } : x))
    );
    try {
      const res = await fetch(`/api/cards/${cardId}/subtasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, completed: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, completed: !next } : x))
      );
      toast.error("Failed to update subtask");
    }
  }

  async function renameSubtask(s: Subtask, title: string) {
    const trimmed = title.trim();
    if (!trimmed || trimmed === s.title) return;
    setItems((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, title: trimmed } : x))
    );
    try {
      await fetch(`/api/cards/${cardId}/subtasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, title: trimmed }),
      });
    } catch {
      toast.error("Failed to rename subtask");
    }
  }

  async function deleteSubtask(id: string) {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== id));
    try {
      await fetch(`/api/cards/${cardId}/subtasks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      setItems(prev);
      toast.error("Failed to delete subtask");
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Subtasks
        </h3>
        {total > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {completed}/{total} completed
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-foreground/70 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {!loading && (
        <ul className="space-y-0.5">
          {items.map((s) => (
            <SubtaskRow
              key={s.id}
              subtask={s}
              onToggle={() => toggleSubtask(s)}
              onRename={(t) => renameSubtask(s, t)}
              onDelete={() => deleteSubtask(s.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSubtask();
            }
          }}
          placeholder="Add a subtask..."
          className="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onRename,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(subtask.title);

  useEffect(() => {
    setTitle(subtask.title);
  }, [subtask.title]);

  return (
    <li className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={() => onToggle()}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => onRename(title)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "flex-1 border-0 bg-transparent text-[13px] outline-none transition-colors",
          subtask.completed && "text-muted-foreground line-through"
        )}
      />
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete subtask"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </li>
  );
}
