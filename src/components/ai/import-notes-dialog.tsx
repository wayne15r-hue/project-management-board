"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import type { BoardWithDetails, Profile, Priority } from "@/types";

interface ExtractedTask {
  title: string;
  description?: string;
  priority?: Priority;
  assignee_name?: string | null;
  due_date?: string | null;
}

interface Props {
  board: BoardWithDetails;
  members: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function ImportNotesDialog({
  board,
  members,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ExtractedTask[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [columnId, setColumnId] = useState(board.columns[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  async function extract() {
    if (!notes.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/extract-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "no_key" || json.code === "not_enabled") {
          toast.error("Enable AI in Settings to use this feature.");
        } else {
          toast.error(json.error || "AI request failed");
        }
        return;
      }
      const found: ExtractedTask[] = json.tasks ?? [];
      if (found.length === 0) {
        toast.info("No actionable tasks found in the text.");
        return;
      }
      setTasks(found);
      setSelected(new Set(found.map((_, i) => i)));
    } catch {
      toast.error("AI request failed");
    } finally {
      setLoading(false);
    }
  }

  async function createTasks() {
    if (!tasks || !columnId) return;
    setCreating(true);
    try {
      const picked = tasks.filter((_, i) => selected.has(i));
      for (const t of picked) {
        const assignee = t.assignee_name
          ? members.find((m) =>
              (m.full_name || m.email)
                .toLowerCase()
                .includes(t.assignee_name!.toLowerCase())
            )
          : null;
        await fetch(`/api/boards/${board.id}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId,
            title: t.title,
            description: t.description || undefined,
            priority: t.priority || "medium",
            due_date: t.due_date || undefined,
            assignee_id: assignee?.id ?? undefined,
          }),
        });
      }
      toast.success(`Created ${picked.length} cards ✨`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Failed to create some cards");
    } finally {
      setCreating(false);
    }
  }

  function reset() {
    setNotes("");
    setTasks(null);
    setSelected(new Set());
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Import from Notes
          </DialogTitle>
        </DialogHeader>

        {!tasks ? (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              Paste meeting notes, an email, or a brainstorm. AI will extract
              actionable tasks.
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              placeholder="Paste content here..."
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={extract}
                disabled={!notes.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Extract tasks
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[12px]">
              <button
                type="button"
                onClick={() => setTasks(null)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                Edit text
              </button>
              <span className="text-muted-foreground">
                {selected.size} of {tasks.length} selected
              </span>
            </div>

            <div className="max-h-[45vh] space-y-2 overflow-y-auto">
              {tasks.map((t, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
                >
                  <Checkbox
                    checked={selected.has(i)}
                    onCheckedChange={() => toggle(i)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {t.priority && (
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          {t.priority}
                        </span>
                      )}
                      {t.due_date && (
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          due {t.due_date}
                        </span>
                      )}
                      {t.assignee_name && (
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          {t.assignee_name}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <label className="text-[12px] text-muted-foreground">
                  Add to:
                </label>
                <select
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
                >
                  {board.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                onClick={createTasks}
                disabled={creating || selected.size === 0}
              >
                {creating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Create {selected.size} card{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
