"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, LayoutDashboard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Board } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface BoardListProps {
  boards: Board[];
  userId: string;
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
      // Create board
      const { data: board, error: boardError } = await supabase
        .from("boards")
        .insert({ name: name.trim(), description: description.trim() || null, owner_id: userId })
        .select()
        .single();

      if (boardError) throw boardError;

      // Create default columns
      const defaultColumns = [
        { board_id: board.id, name: "To Do", position: 0, color: "#6366f1" },
        { board_id: board.id, name: "In Progress", position: 1, color: "#f59e0b" },
        { board_id: board.id, name: "Done", position: 2, color: "#22c55e" },
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="flex h-[140px] items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:border-muted-foreground/50 hover:bg-muted cursor-pointer">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Plus className="h-8 w-8" />
            <span className="text-sm font-medium">Create new board</span>
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

      {boards.map((board) => (
        <Card
          key={board.id}
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => router.push(`/dashboard/board/${board.id}`)}
        >
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <LayoutDashboard className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">
                  {board.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 text-xs mt-1">
                  {board.description || "No description"}
                </CardDescription>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(board.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
