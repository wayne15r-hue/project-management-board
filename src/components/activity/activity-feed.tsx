"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { describeActivity } from "@/lib/activity";
import type { ActivityLog, Profile } from "@/types";

interface ActivityItem extends ActivityLog {
  actor: Profile;
}

interface ActivityFeedProps {
  cardId: string;
}

export function ActivityFeed({ cardId }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (nextCursor?: string) => {
    const isMore = !!nextCursor;
    if (isMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const url = `/api/cards/${cardId}/activity?limit=20${nextCursor ? `&cursor=${nextCursor}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();

      if (isMore) {
        setItems((prev) => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No activity yet
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground mb-3">Activity</p>
      <ScrollArea className="max-h-64">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                <AvatarFallback className="text-[10px]">
                  {item.actor?.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm">
                  {describeActivity(
                    item.action,
                    item.changes as Record<string, unknown> | null,
                    item.actor?.full_name || item.actor?.email || "Someone"
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      {cursor && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2"
          onClick={() => load(cursor)}
          disabled={loadingMore}
        >
          {loadingMore ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Load more
        </Button>
      )}
    </div>
  );
}
