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
  BarChart3,
  CalendarDays,
  MoreHorizontal,
  Pencil,
  Trash2,
  Settings,
  Share2,
  Palette,
  Check,
  Upload,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { ImportCardsDialog } from "./import-cards-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ViewControls } from "./view-controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BOARD_THEMES } from "@/lib/board-themes";
import type { BoardBackground, BoardWithDetails, Profile } from "@/types";

type BoardView = "kanban" | "table" | "timeline" | "calendar" | "analytics";

interface BoardHeaderProps {
  board: BoardWithDetails;
  members: Profile[];
  activeView: BoardView;
  onViewChange: (view: BoardView) => void;
  presence?: { id: string; name: string; avatar_url: string | null }[];
}

const views = [
  { id: "kanban" as const, label: "Board", icon: Kanban },
  { id: "table" as const, label: "Table", icon: Table2 },
  { id: "timeline" as const, label: "Timeline", icon: GanttChart },
  { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
];

export function BoardHeader({ board, members, activeView, onViewChange, presence = [] }: BoardHeaderProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [importOpen, setImportOpen] = useState(false);

  function handleExport(kind: "csv" | "json") {
    const url = `/api/boards/${board.id}/export?format=${kind}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.name}-export.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleSetTheme(theme: BoardBackground) {
    try {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background_theme: theme }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Failed to update background");
    }
  }

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

        <div className="flex items-center gap-2">
          {presence.length > 0 && (
            <div className="mr-1 flex -space-x-1.5">
              {presence.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  title={`${p.name} is here`}
                  className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-[#7CAFC4] text-[10px] font-semibold text-white"
                  style={
                    p.avatar_url
                      ? {
                          backgroundImage: `url(${p.avatar_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {!p.avatar_url && (p.name?.charAt(0).toUpperCase() || "?")}
                  <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border border-background bg-[#27AE60]" />
                </div>
              ))}
              {presence.length > 4 && (
                <div className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-background bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                  +{presence.length - 4}
                </div>
              )}
            </div>
          )}
          <Popover>
            <PopoverTrigger className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
              <Palette className="h-3.5 w-3.5" />
              Theme
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Background
              </p>
              <div className="mt-1 grid grid-cols-1 gap-1">
                {BOARD_THEMES.map((t) => {
                  const active = (board.background_theme ?? "default") === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSetTheme(t.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
                        active && "bg-accent"
                      )}
                    >
                      <span
                        className="h-5 w-8 rounded-md border border-border"
                        style={{ background: t.preview }}
                      />
                      <span className="flex-1 text-foreground">{t.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-foreground" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
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
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")}>
                <FileJson className="mr-2 h-4 w-4" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import from CSV
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

      <ImportCardsDialog
        boardId={board.id}
        firstColumnId={board.columns[0]?.id ?? null}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => router.refresh()}
      />
    </div>
  );
}
