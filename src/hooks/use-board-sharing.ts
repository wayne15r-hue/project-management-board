"use client";

import { useQuery } from "@tanstack/react-query";
import { useDashboardUserId } from "@/components/shared/auth-session-boundary";
import { responseError } from "@/lib/response-error";
import type { BoardSharing } from "@/types";

export function useBoardSharing(boardId: string) {
  const userId = useDashboardUserId();
  return useQuery({
    queryKey: ["board-sharing", boardId, userId],
    refetchInterval: 15_000,
    queryFn: async ({ signal }): Promise<BoardSharing> => {
      const response = await fetch(`/api/boards/${boardId}/sharing`, { signal });
      if (!response.ok) throw await responseError(response, "Could not load board sharing");
      return response.json();
    },
  });
}
