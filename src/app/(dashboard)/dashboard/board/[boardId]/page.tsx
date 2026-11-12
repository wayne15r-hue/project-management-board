"use client";
import { responseError } from "@/lib/response-error";


import { useEffect, useMemo, useRef } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/board/kanban-board";
import { BoardHeader } from "@/components/board/board-header";
import { TableView } from "@/components/table-view/data-table";
import { GanttChart } from "@/components/timeline-view/gantt-chart";
import { BoardAnalytics } from "@/components/analytics/board-analytics";
import { CalendarView } from "@/components/board/calendar-view";
import { useRealtimeCards } from "@/hooks/use-realtime-cards";
import { useBoardPresence } from "@/hooks/use-board-presence";
import { useBoardSharing } from "@/hooks/use-board-sharing";
import { useBoardStore } from "@/stores/board-store";
import { CardDetailDialog } from "@/components/board/card-detail-dialog";
import { decodeBoardState, encodeBoardState, targetCardId } from "@/lib/board-url-state";
import { applyViewToColumns } from "@/lib/board-filters";
import { getBoardThemeClass } from "@/lib/board-themes";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { useDashboardUserId } from "@/components/shared/auth-session-boundary";
import { cn } from "@/lib/utils";
import type { BoardWithDetails, Profile } from "@/types";

const noMembers: Profile[] = [];

async function fetchBoard(boardId: string): Promise<BoardWithDetails> {
  const res = await fetch(`/api/boards/${boardId}`);
  if (!res.ok) throw new Error("Failed to load board");
  return res.json();
}

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const userId = useDashboardUserId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const hydratingRef = useRef(false);
  const queryRef = useRef(searchParams.toString());

  const activeView = useBoardStore((s) => s.activeView);
  const setActiveView = useBoardStore((s) => s.setActiveView);
  const filters = useBoardStore((s) => s.filters);
  const sorts = useBoardStore((s) => s.sorts);
  const search = useBoardStore((s) => s.search);
  const hydrate = useBoardStore((s) => s.hydrate);

  // URL navigation (including board switching/back/forward) is authoritative.
  useEffect(() => {
    queryRef.current = searchParams.toString();
    hydratingRef.current = true;
    hydrate(decodeBoardState(new URLSearchParams(queryRef.current)));
    hydratingRef.current = false;
  }, [boardId, searchParams, hydrate]);

  // Subscribe to actual UI changes rather than writing stale render state back
  // during URL hydration. Preserve notification and unrelated query parameters.
  useEffect(() => useBoardStore.subscribe((state, previous) => {
    if (hydratingRef.current || (state.filters === previous.filters && state.sorts === previous.sorts && state.search === previous.search)) return;
    const qs = encodeBoardState(new URLSearchParams(queryRef.current), state);
    if (qs === queryRef.current) return;
    queryRef.current = qs;
    router.replace(qs ? pathname + "?" + qs : pathname, { scroll: false });
  }), [pathname, router]);

  const {
    data: boardData,
    isError,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["board", boardId, userId],
    queryFn: () => fetchBoard(boardId),
  });

  const sharingQuery = useBoardSharing(boardId);
  const sharing = sharingQuery.isError ? undefined : sharingQuery.data;
  const members = sharing?.members ?? noMembers;
  const assignmentsLocked = (sharing?.pendingCount ?? 0) > 0;
  const board = useMemo(() => boardData && { ...boardData, assignmentsLocked }, [boardData, assignmentsLocked]);
  const boardPeople = useMemo(() => {
    const people = new Map(members.map((member) => [member.id, member]));
    for (const column of boardData?.columns ?? []) {
      for (const card of column.cards) {
        if (card.assignee && !people.has(card.assignee.id)) people.set(card.assignee.id, card.assignee);
      }
    }
    return [...people.values()];
  }, [boardData, members]);

  useRealtimeCards(boardId);
  const presence = useBoardPresence(boardId);

  const filteredBoard = useMemo<BoardWithDetails | undefined>(() => {
    if (!board) return undefined;
    return {
      ...board,
      columns: applyViewToColumns(board.columns, filters, sorts, search),
    };
  }, [board, filters, sorts, search]);

  if (isLoading) {
    return <BoardSkeleton />;
  }

  if (isError || !board || !filteredBoard) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Board not found</p>
      </div>
    );
  }

  const notificationCard = board.columns.flatMap(c => c.cards).find(c => c.id === targetCardId(new URLSearchParams(searchParams.toString()))) ?? null;

  const themeClass = getBoardThemeClass(board.background_theme);

  return (
    <div className={cn("flex h-full flex-col transition-colors duration-300", themeClass)}>
      <BoardHeader
        board={board}
        members={members}
        filterMembers={boardPeople}
        sharing={sharing}
        activeView={activeView}
        onViewChange={setActiveView}
        presence={presence}
      />

      <CardDetailDialog
        key={notificationCard?.id ?? "notification"}
        card={notificationCard}
        board={board}
        columns={board.columns}
        members={members}
        open={!!notificationCard}
        onOpenChange={(open) => {
          if (open) return;
          const params = new URLSearchParams(queryRef.current);
          params.delete("card");
          queryRef.current = params.toString();
          router.replace(params.size ? pathname + "?" + params : pathname, { scroll: false });
        }}
        onUpdate={async (id, data) => {
          const response = await fetch(`/api/cards/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
          if (!response.ok) throw await responseError(response,"Failed to save card");
          await refetch();
        }}
        onDelete={async (id) => {
          const response = await fetch(`/api/cards/${id}`, { method: "DELETE" });
          if (!response.ok) throw new Error("Failed to delete card");
          await refetch();
        }}
      />

      <div
        key={activeView}
        className="flex min-h-0 flex-1 flex-col animate-fade-in"
      >
        {activeView === "kanban" && (
          <KanbanBoard
            board={board}
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

        {activeView === "calendar" && (
          <CalendarView
            board={filteredBoard}
            members={members}
            onRefresh={() => refetch()}
          />
        )}

        {activeView === "analytics" && (
          <BoardAnalytics board={filteredBoard} members={boardPeople} />
        )}
      </div>
    </div>
  );
}
