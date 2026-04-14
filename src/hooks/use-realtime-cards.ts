"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Payload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export function useRealtimeCards(boardId: string, currentUserId?: string | null) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const lastToastAt = useRef(0);

  useEffect(() => {
    function notify(label: string) {
      const now = Date.now();
      if (now - lastToastAt.current < 1500) return;
      lastToastAt.current = now;
      toast(label, { duration: 2200 });
    }

    function isRemote(p: Payload) {
      const row = (p.new ?? p.old) as Record<string, unknown> | null;
      if (!row || !currentUserId) return true;
      const actor = row.created_by ?? row.assignee_id;
      return actor !== currentUserId;
    }

    const channel = supabase
      .channel(`board-${boardId}-cards`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cards",
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["board", boardId] });
          if (!isRemote(payload as unknown as Payload)) return;
          if (payload.eventType === "INSERT") notify("Someone added a card");
          else if (payload.eventType === "DELETE") notify("Someone deleted a card");
          else notify("Someone updated a card");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "columns",
          filter: `board_id=eq.${boardId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["board", boardId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, queryClient, supabase, currentUserId]);
}
