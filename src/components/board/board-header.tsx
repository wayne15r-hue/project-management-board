"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Kanban,
  Table2,
  GanttChart,
  MoreHorizontal,
  Pencil,
  Trash2,
  Settings,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ViewControls } from "./view-controls";
import type { BoardWithDetails, Profile } from "@/types";

interface BoardHeaderProps {
  board: BoardWithDetails;
  members: Profile[];
  activeView: "kanban" | "table" | "timeline";
  onViewChange: (view: "kanban" | "table" | "timeline") => void;
}

const views = [
  { id: "kanban" as const, label: "Board", icon: Kanban },
  { id: "table" as const, label: "Table", icon: Table2 },
  { id: "timeline" as const, label: "Timeline", icon: GanttChart },
];

export function BoardHeader({ board, members, activeView, onViewChange }: BoardHeaderProps) {
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
    <div className="flex flex-col gap-3 border-b border-border bg-background px-4 pt-6 pb-0 pl-16 md:px-8 md:pl-8">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
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
              className="h-auto border-0 bg-transparent p-0 text-[24px] font-bold leading-tight shadow-none focus-visible:ring-0"
              autoFocus
            />
          ) : (
            <h1
              onClick={() => setIsEditing(true)}
              className="cursor-text text-[24px] font-bold leading-tight text-foreground underline-offset-4 hover:underline decoration-border decoration-2"
            >
              {board.name}
            </h1>
          )}
          {board.description && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {board.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      </div>

      {/* Tabs + controls row */}
      <div className="flex items-center justify-between -mb-px">
        <div className="flex items-center gap-0.5">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => onViewChange(view.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors",
                activeView === view.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <view.icon className="h-3.5 w-3.5" />
              {view.label}
              {activeView === view.id && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          ))}
        </div>

        <ViewControls board={board} members={members} />
      </div>
    </div>
  );
}
