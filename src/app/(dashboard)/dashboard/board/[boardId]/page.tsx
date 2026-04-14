"use client";

import { useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/board/kanban-board";
import { BoardHeader } from "@/components/board/board-header";
import { TableView } from "@/components/table-view/data-table";
import { GanttChart } from "@/components/timeline-view/gantt-chart";
import { useRealtimeCards } from "@/hooks/use-realtime-cards";
import { useBoardStore, type ViewFilter, type ViewSort } from "@/stores/board-store";
import { applyViewToColumns } from "@/lib/board-filters";
import { Loader2 } from "lucide-react";
import type { BoardWithDetails, Profile } from "@/types";

async function fetchBoard(boardId: string): Promise<BoardWithDetails> {
  const res = await fetch(`/api/boards/${boardId}`);
  if (!res.ok) throw new Error("Failed to load board");
  return res.json();
}

async function fetchMembers(): Promise<Profile[]> {
  const res = await fetch("/api/members");
  if (!res.ok) return [];
  return res.json();
}

function encodeState(filters: ViewFilter[], sorts: ViewSort[], search: string) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search);
  if (filters.length) params.set("filter", JSON.stringify(filters));
  if (sorts.length) params.set("sort", JSON.stringify(sorts));
  return params.toString();
}

function decodeState(params: URLSearchParams): {
  filters: ViewFilter[];
  sorts: ViewSort[];
  search: string;
} {
  const search = params.get("q") ?? "";
  let filters: ViewFilter[] = [];
  let sorts: ViewSort[] = [];
  try {
    const f = params.get("filter");
    if (f) filters = JSON.parse(f);
  } catch {}
  try {
    const s = params.get("sort");
    if (s) sorts = JSON.parse(s);
  } catch {}
  return { filters, sorts, search };
}

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);

  const activeView = useBoardStore((s) => s.activeView);
  const setActiveView = useBoardStore((s) => s.setActiveView);
  const filters = useBoardStore((s) => s.filters);
  const sorts = useBoardStore((s) => s.sorts);
  const search = useBoardStore((s) => s.search);
  const hydrate = useBoardStore((s) => s.hydrate);

  // Hydrate from URL on first mount
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    hydrate(decodeState(new URLSearchParams(searchParams.toString())));
  }, [hydrate, searchParams]);

  // Push state changes to URL
  useEffect(() => {
    if (!hydratedRef.current) return;
    const qs = encodeState(filters, sorts, search);
    const url = qs ? `?${qs}` : window.location.pathname;
    router.replace(url, { scroll: false });
  }, [filters, sorts, search, router]);

  const {
    data: board,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => fetchBoard(boardId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: fetchMembers,
  });

  useRealtimeCards(boardId);

  const filteredBoard = useMemo<BoardWithDetails | undefined>(() => {
    if (!board) return undefined;
    return {
      ...board,
      columns: applyViewToColumns(board.columns, filters, sorts, search),
    };
  }, [board, filters, sorts, search]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board || !filteredBoard) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Board not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BoardHeader
        board={board}
        members={members}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {activeView === "kanban" && (
        <KanbanBoard
          board={filteredBoard}
          members={members}
          onRefresh={() => refetch()}
        />
      )}

      {activeView === "table" && (
        <TableView
          board={filteredBoard}
          members={members}
          onRefresh={() => refetch()}
        />
      )}

      {activeView === "timeline" && <GanttChart board={filteredBoard} />}
    </div>
  );
}
