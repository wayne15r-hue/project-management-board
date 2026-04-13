"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KanbanBoard } from "@/components/board/kanban-board";
import { BoardHeader } from "@/components/board/board-header";
import { TableView } from "@/components/table-view/data-table";
import { GanttChart } from "@/components/timeline-view/gantt-chart";
import { useRealtimeCards } from "@/hooks/use-realtime-cards";
import { useBoardStore } from "@/stores/board-store";
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

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { activeView, setActiveView } = useBoardStore();

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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board) {
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
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {activeView === "kanban" && (
        <KanbanBoard
          board={board}
          members={members}
          onRefresh={() => refetch()}
        />
      )}

      {activeView === "table" && (
        <TableView
          board={board}
          members={members}
          onRefresh={() => refetch()}
        />
      )}

      {activeView === "timeline" && (
        <GanttChart board={board} />
      )}
    </div>
  );
}
