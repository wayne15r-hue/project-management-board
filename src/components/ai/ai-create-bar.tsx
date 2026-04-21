"use client";

import { useState } from "react";
import { Sparkles, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BoardWithDetails, Profile, Priority } from "@/types";

interface ParsedCard {
  title: string;
  description?: string;
  priority?: Priority;
  due_date?: string | null;
  assignee_name?: string | null;
  labels?: string[];
  column?: string;
}

interface AICreateBarProps {
  board: BoardWithDetails;
  members: Profile[];
  onCreated: () => void;
}

export function AICreateBar({ board, members, onCreated }: AICreateBarProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedCard | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleParse(e?: React.FormEvent) {
    e?.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/parse-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value, boardId: board.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "no_key" || json.code === "not_enabled") {
          toast.error("Enable AI in Settings to use this feature.");
        } else {
          toast.error(json.error || "AI parse failed");
        }
        return;
      }
      setPreview(json);
    } catch {
      toast.error("AI parse failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setCreating(true);
    try {
      const previewColumn = (preview.column ?? "").toLowerCase();
      const column =
        board.columns.find((c) => c.name.toLowerCase() === previewColumn) ||
        board.columns[0];
      if (!column) {
        toast.error("No columns available");
        return;
      }

      const assigneeName = (preview.assignee_name ?? "").trim();
      const assignee = assigneeName
        ? members.find((m) =>
            (m.full_name || m.email || "")
              .toLowerCase()
              .includes(assigneeName.toLowerCase())
          )
        : null;

      const previewTitle = (preview.title ?? "").trim();
      const previewDescription = (preview.description ?? "").trim();

      const labelIds: string[] = [];
      if (preview.labels?.length) {
        // Fetch board labels to resolve names -> ids
        const res = await fetch(`/api/boards/${board.id}/labels`);
        if (res.ok) {
          const boardLabels = (await res.json()) as {
            id: string;
            name: string;
          }[];
          for (const name of preview.labels) {
            if (typeof name !== "string") continue;
            const n = name.toLowerCase();
            const match = boardLabels.find((l) => l.name.toLowerCase() === n);
            if (match) labelIds.push(match.id);
          }
        }
      }

      const createRes = await fetch(`/api/boards/${board.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnId: column.id,
          title: previewTitle || "Untitled Task",
          description: previewDescription || undefined,
          priority: preview.priority || "medium",
          due_date: preview.due_date || undefined,
          assignee_id: assignee?.id ?? undefined,
        }),
      });
      if (!createRes.ok) throw new Error("Create failed");
      const newCard = await createRes.json();

      // Attach labels (best effort)
      if (labelIds.length > 0) {
        await Promise.all(
          labelIds.map((id) =>
            fetch(`/api/cards/${newCard.id}/labels`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label_id: id }),
            }).catch(() => null)
          )
        );
      }

      toast.success("Card created with AI ✨");
      setPreview(null);
      setValue("");
      onCreated();
    } catch {
      toast.error("Failed to create card");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="px-6 pt-3">
      {!preview ? (
        <form onSubmit={handleParse} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Describe a task… (e.g., 'Fix Safari login bug, high priority, due Friday, assign to me')"
              disabled={loading}
              className="pl-9"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!value.trim() || loading}
            variant="outline"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                AI Create
              </>
            )}
          </Button>
        </form>
      ) : (
        <AIPreviewCard
          preview={preview}
          members={members}
          board={board}
          onChange={setPreview}
          onCancel={() => setPreview(null)}
          onConfirm={handleConfirm}
          creating={creating}
        />
      )}
    </div>
  );
}

function AIPreviewCard({
  preview,
  members,
  board,
  onChange,
  onCancel,
  onConfirm,
  creating,
}: {
  preview: ParsedCard;
  members: Profile[];
  board: BoardWithDetails;
  onChange: (p: ParsedCard) => void;
  onCancel: () => void;
  onConfirm: () => void;
  creating: boolean;
}) {
  if (!preview || typeof preview !== "object") return null;
  const safeTitle = typeof preview.title === "string" ? preview.title : "";
  const safeDescription =
    typeof preview.description === "string" ? preview.description : "";
  const safePriority: Priority =
    preview.priority === "low" ||
    preview.priority === "medium" ||
    preview.priority === "high"
      ? preview.priority
      : "medium";
  const safeDueDate =
    typeof preview.due_date === "string" ? preview.due_date : "";
  const safeAssignee =
    typeof preview.assignee_name === "string" ? preview.assignee_name : "";
  const safeColumn =
    typeof preview.column === "string" && preview.column
      ? preview.column
      : board.columns[0]?.name ?? "";
  const safeLabels = Array.isArray(preview.labels)
    ? preview.labels.filter((l): l is string => typeof l === "string")
    : [];

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        AI preview — edit before creating
      </div>
      <div className="space-y-2">
        <Input
          value={safeTitle}
          onChange={(e) => onChange({ ...preview, title: e.target.value })}
          placeholder="Title"
        />
        <Textarea
          value={safeDescription}
          onChange={(e) =>
            onChange({ ...preview, description: e.target.value })
          }
          placeholder="Description (optional)"
          rows={2}
        />
        <div className="flex flex-wrap gap-2 text-[12px]">
          <select
            value={safePriority}
            onChange={(e) =>
              onChange({
                ...preview,
                priority: e.target.value as Priority,
              })
            }
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select
            value={safeColumn}
            onChange={(e) => onChange({ ...preview, column: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            {board.columns.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={safeDueDate}
            onChange={(e) =>
              onChange({ ...preview, due_date: e.target.value || null })
            }
            className="rounded-md border border-border bg-background px-2 py-1"
          />
          <select
            value={safeAssignee}
            onChange={(e) =>
              onChange({
                ...preview,
                assignee_name: e.target.value || null,
              })
            }
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="">No assignee</option>
            {members.map((m) => (
              <option key={m.id} value={m.full_name || m.email}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
        {safeLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {safeLabels.map((l) => (
              <span
                key={l}
                className={cn(
                  "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
                )}
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={creating}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={creating || !safeTitle.trim()}
        >
          {creating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1 h-3.5 w-3.5" />
          )}
          Create card
        </Button>
      </div>
    </div>
  );
}
