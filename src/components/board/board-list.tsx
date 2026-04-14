"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, LayoutGrid, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board-templates";
import { cn } from "@/lib/utils";
import type { Board } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface BoardListProps {
  boards: Board[];
  userId: string;
}

const BOARD_COLORS = [
  "#E8A87C",
  "#7CAFC4",
  "#9B8FBF",
  "#8BAE68",
  "#D4846A",
  "#C4A464",
  "#6B9EAE",
];

function getBoardColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return BOARD_COLORS[Math.abs(hash) % BOARD_COLORS.length];
}

export function BoardList({ boards, userId }: BoardListProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"template" | "details">("template");
  const [template, setTemplate] = useState<BoardTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function resetForm() {
    setStep("template");
    setTemplate(null);
    setName("");
    setDescription("");
  }

  function selectTemplate(t: BoardTemplate) {
    setTemplate(t);
    setStep("details");
  }

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !template) return;
    setLoading(true);

    try {
      const { data: board, error: boardError } = await supabase
        .from("boards")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          owner_id: userId,
        })
        .select()
        .single();

      if (boardError) throw boardError;

      const columnsPayload = template.columns.map((col, idx) => ({
        board_id: board.id,
        name: col.name,
        position: idx,
        color: col.color,
      }));

      const { error: colError } = await supabase
        .from("columns")
        .insert(columnsPayload);

      if (colError) throw colError;

      if (template.labels.length > 0) {
        const labelsPayload = template.labels.map((l) => ({
          board_id: board.id,
          name: l.name,
          color: l.color,
        }));
        await supabase.from("labels").insert(labelsPayload);
      }

      toast.success("Board created!");
      setOpen(false);
      resetForm();
      router.push(`/dashboard/board/${board.id}`);
      router.refresh();
    } catch (err) {
      toast.error("Failed to create board");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const createDialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger className="flex min-h-[148px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent text-muted-foreground transition hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground">
        <div className="flex flex-col items-center gap-1.5">
          <Plus className="h-5 w-5" />
          <span className="text-[13px] font-medium">New board</span>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {step === "template" ? (
          <>
            <DialogHeader>
              <DialogTitle>Choose a template</DialogTitle>
              <DialogDescription>
                Start with a pre-configured board or create a blank one.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto py-4 sm:grid-cols-2">
              {BOARD_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t)}
                  className={cn(
                    "group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition",
                    "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[20px]">{t.icon}</span>
                    <span className="text-[14px] font-semibold text-foreground">
                      {t.name}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {t.description}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.columns.map((c) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateBoard}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("template")}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <DialogTitle>
                  {template?.icon} {template?.name}
                </DialogTitle>
              </div>
              <DialogDescription>{template?.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="board-name">Board name</Label>
                <Input
                  id="board-name"
                  placeholder="My Project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="board-desc">Description (optional)</Label>
                <Textarea
                  id="board-desc"
                  placeholder="What is this board for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Board
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  if (boards.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center animate-fade-in">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="mt-5 text-[18px] font-semibold text-foreground">
          Create your first board
        </h2>
        <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          Boards help you organize tasks into columns and track progress across
          your project.
        </p>
        <div className="mt-5">{createDialog}</div>
      </div>
    );
  }

  return (
    <div className="stagger-children grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => {
        const color = getBoardColor(board.id);
        return (
          <button
            key={board.id}
            type="button"
            onClick={() => router.push(`/dashboard/board/${board.id}`)}
            className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-border hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
          >
            <div className="h-1 w-full" style={{ backgroundColor: color }} />
            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {board.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-foreground">
                    {board.name}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                    {board.description || "No description"}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between pt-2 text-[12px] text-muted-foreground">
                <span>
                  Updated{" "}
                  {formatDistanceToNow(new Date(board.created_at), {
                    addSuffix: true,
                  })}
                </span>
                <div className="flex -space-x-1.5">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-card text-[9px] font-semibold text-white"
                    style={{ backgroundColor: color }}
                  >
                    1
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}

      {createDialog}
    </div>
  );
}
