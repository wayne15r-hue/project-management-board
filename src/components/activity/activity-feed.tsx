"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, Activity, Send } from "lucide-react";
import { describeActivity } from "@/lib/activity";
import { toast } from "sonner";
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
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

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
            {items.map((item) => {
              const isComment = item.action === "commented";
              const commentText = isComment
                ? (item.changes as Record<string, unknown> | null)?.text as string | undefined
                : undefined;
              return (
                <div key={item.id} className="flex gap-3">
                  <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                    <AvatarFallback
                      className={`${isComment ? "bg-[#9B8FBF]" : "bg-[#7CAFC4]"} text-[10px] font-semibold text-white`}
                    >
                      {item.actor?.full_name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase() ||
                        item.actor?.email?.charAt(0).toUpperCase() ||
                        "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    {isComment ? (
                      <>
                        <p className="text-[12px] font-medium text-foreground">
                          {item.actor?.full_name || item.actor?.email || "Someone"}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                          {commentText}
                        </p>
                      </>
                    ) : (
                      <p className="text-[13px] leading-snug">
                        {describeActivity(
                          item.action,
                          item.changes as Record<string, unknown> | null,
                          item.actor?.full_name || item.actor?.email || "Someone"
                        )}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
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
      <form
        className="mt-4 flex items-start gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!comment.trim() || posting) return;
          setPosting(true);
          try {
            const res = await fetch(`/api/cards/${cardId}/comments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: comment.trim() }),
            });
            if (!res.ok) throw new Error("Failed to post comment");
            const newItem = await res.json();
            setItems((prev) => [newItem, ...prev]);
            setComment("");
          } catch {
            toast.error("Failed to post comment");
          } finally {
            setPosting(false);
          }
        }}
      >
        <Avatar className="mt-0.5 h-6 w-6 shrink-0">
          <AvatarFallback className="bg-[#9B8FBF] text-[10px] font-semibold text-white">
            ME
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-1 items-center gap-1">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-accent/40 focus:border-foreground/20"
          />
          <button
            type="submit"
            disabled={!comment.trim() || posting}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
