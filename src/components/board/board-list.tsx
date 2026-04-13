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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    try {
      const { data: board, error: boardError } = await supabase
        .from("boards")
        .insert({ name: name.trim(), description: description.trim() || null, owner_id: userId })
        .select()
        .single();

      if (boardError) throw boardError;

      const defaultColumns = [
        { board_id: board.id, name: "To Do", position: 0, color: "#9B8FBF" },
        { board_id: board.id, name: "In Progress", position: 1, color: "#E8A87C" },
        { board_id: board.id, name: "Done", position: 2, color: "#8BAE68" },
      ];

      const { error: colError } = await supabase
        .from("columns")
        .insert(defaultColumns);

      if (colError) throw colError;

      toast.success("Board created!");
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/dashboard/board/${board.id}`);
      router.refresh();
    } catch (err) {
      toast.error("Failed to create board");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => {
        const color = getBoardColor(board.id);
        return (
          <button
            key={board.id}
            type="button"
            onClick={() => router.push(`/dashboard/board/${board.id}`)}
            className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-border hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
          >
            <div
              className="h-1 w-full"
              style={{ backgroundColor: color }}
            />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="flex min-h-[148px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent text-muted-foreground transition hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground">
          <div className="flex flex-col items-center gap-1.5">
            <Plus className="h-5 w-5" />
            <span className="text-[13px] font-medium">New board</span>
          </div>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleCreateBoard}>
            <DialogHeader>
              <DialogTitle>Create a new board</DialogTitle>
              <DialogDescription>
                Add a new project board with default columns.
              </DialogDescription>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
