"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Plus,
  Loader2,
  LayoutGrid,
  ArrowLeft,
  Search,
  Star,
  List,
  Grid3x3,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/board-templates";
import { cn } from "@/lib/utils";
import type { Board } from "@/types";
import { formatDistanceToNow } from "date-fns";

interface BoardStats {
  total: number;
  done: number;
  overdue: number;
}

interface BoardListProps {
  boards: Board[];
  userId: string;
  boardStats?: Record<string, BoardStats>;
}

type SortKey = "updated" | "alpha" | "cards";
type ViewMode = "grid" | "list";

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

const VIEW_KEY = "pm-board-view-mode";
const SORT_KEY = "pm-board-sort";

export function BoardList({ boards, userId, boardStats = {} }: BoardListProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"template" | "details">("template");
  const [template, setTemplate] = useState<BoardTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortKey>("updated");
  const router = useRouter();
  const supabase = createClient();

  // Hydrate persisted view/sort preferences
  useEffect(() => {
    const v = localStorage.getItem(VIEW_KEY) as ViewMode | null;
    if (v === "grid" || v === "list") setView(v);
    const s = localStorage.getItem(SORT_KEY) as SortKey | null;
    if (s === "updated" || s === "alpha" || s === "cards") setSort(s);
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem(SORT_KEY, sort);
  }, [sort]);

  // Load favorites
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/boards/favorites");
        if (!res.ok) return;
        const data = await res.json();
        setFavorites(new Set(data.boardIds ?? []));
      } catch {
        // fall back to localStorage
        try {
          const local = localStorage.getItem("pm-board-favorites");
          if (local) setFavorites(new Set(JSON.parse(local)));
        } catch {}
      }
    })();
  }, []);

  async function toggleFavorite(boardId: string) {
    const next = new Set(favorites);
    const willFavorite = !next.has(boardId);
    if (willFavorite) next.add(boardId);
    else next.delete(boardId);
    setFavorites(next);
    try {
      await fetch("/api/boards/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, favorite: willFavorite }),
      });
    } catch {
      localStorage.setItem(
        "pm-board-favorites",
        JSON.stringify(Array.from(next))
      );
    }
  }

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
        await supabase.from("labels").insert(
          template.labels.map((l) => ({
            board_id: board.id,
            name: l.name,
            color: l.color,
          }))
        );
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

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = boards.filter(
      (b) =>
        !q ||
        b.name.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q)
    );
    list = [...list].sort((a, b) => {
      const fa = favorites.has(a.id) ? 1 : 0;
      const fb = favorites.has(b.id) ? 1 : 0;
      if (fa !== fb) return fb - fa; // favorites first
      switch (sort) {
        case "alpha":
          return a.name.localeCompare(b.name);
        case "cards": {
          const ac = boardStats[a.id]?.total ?? 0;
          const bc = boardStats[b.id]?.total ?? 0;
          return bc - ac;
        }
        case "updated":
        default:
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
      }
    });
    return list;
  }, [boards, query, sort, favorites, boardStats]);

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
    <div className="space-y-4">
      {/* Toolbar: search, sort, view toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search boards..."
            className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-foreground/30 focus:ring-2 focus:ring-foreground/10"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 appearance-none rounded-md border border-border bg-card pl-8 pr-7 text-[12.5px] font-medium text-foreground outline-none transition-colors hover:bg-accent"
            >
              <option value="updated">Recently updated</option>
              <option value="alpha">Alphabetical</option>
              <option value="cards">Most cards</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded transition-colors",
                view === "grid"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Grid view"
            >
              <Grid3x3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded transition-colors",
                view === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {filteredSorted.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-[13px] text-muted-foreground">
          No boards match &quot;{query}&quot;.
        </div>
      ) : view === "grid" ? (
        <div className="stagger-children grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSorted.map((board) => (
            <BoardGridCard
              key={board.id}
              board={board}
              favorite={favorites.has(board.id)}
              onToggleFavorite={() => toggleFavorite(board.id)}
              stats={boardStats[board.id]}
            />
          ))}
          {createDialog}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {filteredSorted.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              favorite={favorites.has(board.id)}
              onToggleFavorite={() => toggleFavorite(board.id)}
              stats={boardStats[board.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardGridCard({
  board,
  favorite,
  onToggleFavorite,
  stats,
}: {
  board: Board;
  favorite: boolean;
  onToggleFavorite: () => void;
  stats?: BoardStats;
}) {
  const router = useRouter();
  const color = getBoardColor(board.id);
  const total = stats?.total ?? 0;
  const done = stats?.done ?? 0;
  const overdue = stats?.overdue ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      onClick={() => router.push(`/dashboard/board/${board.id}`)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-border hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={favorite ? "Unfavorite" : "Favorite"}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
              favorite
                ? "text-[#F2994A]"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
            )}
          >
            <Star
              className="h-4 w-4"
              fill={favorite ? "currentColor" : "none"}
            />
          </button>
        </div>

        {total > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{progress}% complete</span>
              <span>
                {done}/{total} cards
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progress}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-2 text-[12px] text-muted-foreground">
          <span>
            Updated{" "}
            {formatDistanceToNow(new Date(board.updated_at), {
              addSuffix: true,
            })}
          </span>
          {overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EB5757]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#EB5757]">
              <AlertCircle className="h-3 w-3" />
              {overdue} overdue
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function BoardRow({
  board,
  favorite,
  onToggleFavorite,
  stats,
}: {
  board: Board;
  favorite: boolean;
  onToggleFavorite: () => void;
  stats?: BoardStats;
}) {
  const router = useRouter();
  const color = getBoardColor(board.id);
  const total = stats?.total ?? 0;
  const done = stats?.done ?? 0;
  const overdue = stats?.overdue ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/dashboard/board/${board.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/dashboard/board/${board.id}`);
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {board.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-foreground">
            {board.name}
          </span>
          {overdue > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EB5757]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#EB5757]">
              {overdue} overdue
            </span>
          )}
        </div>
        {board.description && (
          <p className="truncate text-[12px] text-muted-foreground">
            {board.description}
          </p>
        )}
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <div className="w-24">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
          <p className="mt-0.5 text-right text-[10.5px] text-muted-foreground">
            {done}/{total}
          </p>
        </div>
        <span className="w-28 text-right text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(board.updated_at), { addSuffix: true })}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={favorite ? "Unfavorite" : "Favorite"}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
          favorite
            ? "text-[#F2994A]"
            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
        )}
      >
        <Star className="h-4 w-4" fill={favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
