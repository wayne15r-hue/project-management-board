"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  MessageCircle,
  Activity,
  Send,
  MoreHorizontal,
  Pencil,
  Trash2,
  Reply as ReplyIcon,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { describeActivity } from "@/lib/activity";
import { renderMarkdown } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ActivityLog, Profile } from "@/types";

interface ActivityItem extends ActivityLog {
  actor: Profile;
}

interface ActivityFeedProps {
  cardId: string;
}

interface CommentChanges {
  text?: string;
  parent_id?: string;
  edited?: boolean;
}

export function ActivityFeed({ cardId }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<ActivityItem | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(
    async (nextCursor?: string) => {
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
    },
    [cardId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Group: top-level items + replies grouped by parent
  const grouped = useMemo(() => {
    const replies = new Map<string, ActivityItem[]>();
    const top: ActivityItem[] = [];
    for (const it of items) {
      const parentId =
        it.action === "commented"
          ? (it.changes as CommentChanges | null)?.parent_id
          : undefined;
      if (parentId) {
        const arr = replies.get(parentId) ?? [];
        arr.push(it);
        replies.set(parentId, arr);
      } else {
        top.push(it);
      }
    }
    // chronological replies (oldest first within thread)
    for (const arr of replies.values()) {
      arr.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return { top, replies };
  }, [items]);

  async function postComment(text: string, parentId?: string) {
    setPosting(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, parent_id: parentId ?? null }),
      });
      if (!res.ok) throw new Error();
      const newItem = await res.json();
      setItems((prev) => [newItem, ...prev]);
      return true;
    } catch {
      toast.error("Failed to post comment");
      return false;
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    try {
      const res = await fetch(`/api/cards/${cardId}/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...updated } : it))
      );
      setEditingId(null);
      setEditText("");
    } catch {
      toast.error("Failed to update comment");
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("Delete this comment?")) return;
    try {
      const res = await fetch(`/api/cards/${cardId}/comments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch {
      toast.error("Failed to delete comment");
    }
  }

  function renderItem(item: ActivityItem, isReply = false) {
    const isComment = item.action === "commented";
    const changes = (item.changes as CommentChanges | null) ?? {};
    const commentText = changes.text;
    const edited = !!changes.edited;
    const isEditing = editingId === item.id;
    const isMine = currentUserId === item.actor_id;

    return (
      <div
        key={item.id}
        className={`group/comment flex gap-3 ${isReply ? "ml-9 pl-3 border-l border-border" : ""}`}
      >
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
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium text-foreground">
                  {item.actor?.full_name || item.actor?.email || "Someone"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), {
                    addSuffix: true,
                  })}
                </p>
                {edited && (
                  <span className="text-[10px] text-muted-foreground">
                    (edited)
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/comment:opacity-100">
                  {!isReply && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(item);
                        setComment("");
                      }}
                      className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <ReplyIcon className="h-3 w-3" />
                      Reply
                    </button>
                  )}
                  {isMine && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Comment actions"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingId(item.id);
                            setEditText(commentText ?? "");
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deleteComment(item.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              {isEditing ? (
                <div className="mt-1 space-y-1.5">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-foreground/20"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveEdit(item.id)}
                      disabled={!editText.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setEditText("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/90">
                  {commentText ? renderMarkdown(commentText) : null}
                </p>
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    );
  }

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
      ) : grouped.top.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-8 text-center">
          <MessageCircle className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-[12px] text-muted-foreground">No activity yet</p>
        </div>
      ) : (
        <ScrollArea className="max-h-72">
          <div className="space-y-3 pr-2">
            {grouped.top.map((item) => (
              <div key={item.id} className="space-y-2">
                {renderItem(item)}
                {(grouped.replies.get(item.id) ?? []).map((r) =>
                  renderItem(r, true)
                )}
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

      {/* Reply context */}
      {replyTo && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border bg-accent/40 px-2 py-1.5">
          <ReplyIcon className="h-3 w-3 text-muted-foreground" />
          <p className="flex-1 truncate text-[12px] text-muted-foreground">
            Replying to {replyTo.actor?.full_name || replyTo.actor?.email}
          </p>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Comment input */}
      <form
        className="mt-4 flex items-start gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!comment.trim() || posting) return;
          const ok = await postComment(comment.trim(), replyTo?.id);
          if (ok) {
            setComment("");
            setReplyTo(null);
          }
        }}
      >
        <Avatar className="mt-0.5 h-6 w-6 shrink-0">
          <AvatarFallback className="bg-[#9B8FBF] text-[10px] font-semibold text-white">
            ME
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col gap-1">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={
              replyTo
                ? "Write a reply… (Markdown: **bold** *italic* `code`)"
                : "Write a comment… (Markdown: **bold** *italic* `code`)"
            }
            className="flex-1 resize-none rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-accent/40 focus:border-foreground/20"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] text-muted-foreground">
              Press ⌘/Ctrl + Enter to send
            </p>
            <button
              type="submit"
              disabled={!comment.trim() || posting}
              className="flex h-7 items-center gap-1 rounded-md bg-foreground px-2 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
            >
              {posting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {replyTo ? "Reply" : "Post"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
