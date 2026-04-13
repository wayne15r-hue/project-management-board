"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, Activity } from "lucide-react";
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

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        Activity
      </h3>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-8 text-center">
          <MessageCircle className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-[12px] text-muted-foreground">No activity yet</p>
        </div>
      ) : (
        <ScrollArea className="max-h-64">
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3">
                <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                  <AvatarFallback className="bg-[#7CAFC4] text-[10px] font-semibold text-white">
                    {item.actor?.full_name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase() ||
                      item.actor?.email?.charAt(0).toUpperCase() ||
                      "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug">
                    {describeActivity(
                      item.action,
                      item.changes as Record<string, unknown> | null,
                      item.actor?.full_name || item.actor?.email || "Someone"
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(item.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {cursor && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => load(cursor)}
          disabled={loadingMore}
        >
          {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Load more
        </Button>
      )}

      {/* Comment input */}
      <div className="mt-4 flex items-start gap-2">
        <Avatar className="mt-0.5 h-6 w-6 shrink-0">
          <AvatarFallback className="bg-[#9B8FBF] text-[10px] font-semibold text-white">
            ME
          </AvatarFallback>
        </Avatar>
        <input
          type="text"
          placeholder="Write a comment..."
          disabled
          className="flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-accent/40 focus:border-foreground/20 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
