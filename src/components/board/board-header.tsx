"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kanban, Table2, GanttChart, MoreHorizontal, Pencil, Trash2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Board } from "@/types";

interface BoardHeaderProps {
  board: Board;
  activeView: "kanban" | "table" | "timeline";
  onViewChange: (view: "kanban" | "table" | "timeline") => void;
}

const views = [
  { id: "kanban" as const, label: "Board", icon: Kanban },
  { id: "table" as const, label: "Table", icon: Table2 },
  { id: "timeline" as const, label: "Timeline", icon: GanttChart },
];

export function BoardHeader({ board, activeView, onViewChange }: BoardHeaderProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(board.name);

  async function handleRename() {
    if (name.trim() && name.trim() !== board.name) {
      try {
        const res = await fetch(`/api/boards/${board.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) throw new Error();
        router.refresh();
      } catch {
        toast.error("Failed to rename board");
        setName(board.name);
      }
    }
    setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this board? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Failed to delete board");
    }
  }

  return (
    <div className="flex items-center justify-between border-b px-6 h-14">
      <div className="flex items-center gap-4">
        {isEditing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setName(board.name);
                setIsEditing(false);
              }
            }}
            className="h-8 text-lg font-bold w-64"
            autoFocus
          />
        ) : (
          <h1 className="text-lg font-bold">{board.name}</h1>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 w-8 hover:bg-accent hover:text-accent-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* View Switcher */}
      <div className="flex items-center rounded-lg border bg-muted p-1">
        {views.map((view) => (
          <button
            key={view.id}
            onClick={() => onViewChange(view.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeView === view.id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <view.icon className="h-4 w-4" />
            {view.label}
          </button>
        ))}
      </div>
    </div>
  );
}
