"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, AtSign, UserPlus, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Actor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
}

interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: "assignment" | "mention" | "comment";
  card_id: string | null;
  board_id: string | null;
  activity_log_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  actor: Actor | null;
  card_title: string | null;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initialsOf(actor: Actor | null): string {
  const source = actor?.full_name || actor?.email || "?";
  return source
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function iconFor(type: Notification["type"]) {
  if (type === "assignment") return <UserPlus className="h-3 w-3" />;
  if (type === "mention") return <AtSign className="h-3 w-3" />;
  return <MessageSquare className="h-3 w-3" />;
}

export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread_count ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as Notification;
          // Fetch actor + card_title for display
          let actor: Actor | null = null;
          let card_title: string | null = null;
          if (row.actor_id) {
            const { data } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url, email")
              .eq("id", row.actor_id)
              .single();
            actor = data as Actor | null;
          }
          if (row.card_id) {
            const { data } = await supabase
              .from("cards")
              .select("title")
              .eq("id", row.card_id)
              .single();
            card_title = data?.title ?? null;
          }
          const full: Notification = { ...row, actor, card_title };
          setNotifications((prev) =>
            prev.some((n) => n.id === full.id) ? prev : [full, ...prev]
          );
          if (!full.read_at) setUnread((c) => c + 1);

          if (!openRef.current) {
            toast(full.title, {
              description: full.body ?? undefined,
              action: full.card_id && full.board_id
                ? {
                    label: "View",
                    onClick: () =>
                      router.push(
                        `/dashboard/board/${full.board_id}?card=${full.card_id}`
                      ),
                  }
                : undefined,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === row.id ? { ...n, read_at: row.read_at } : n
            )
          );
          setUnread((prev) => {
            // recompute from state on next tick
            return prev; // handled by load() guarded below
          });
          // Re-sync count to be safe
          fetch("/api/notifications")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.unread_count !== undefined) setUnread(d.unread_count);
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  async function handleClickNotification(n: Notification) {
    if (!n.read_at) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      );
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.board_id && n.card_id) {
      router.push(`/dashboard/board/${n.board_id}?card=${n.card_id}`);
    } else if (n.board_id) {
      router.push(`/dashboard/board/${n.board_id}`);
    }
  }

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    );
    setUnread(0);
  }

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                {badge}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[13px] font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-md bg-muted/50"
                />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <Bell className="h-6 w-6 text-muted-foreground opacity-50" />
              <p className="text-[13px] text-muted-foreground">
                No notifications yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotification(n)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                        isUnread && "bg-primary/5"
                      )}
                    >
                      <div className="relative shrink-0">
                        <div
                          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#7CAFC4] text-[11px] font-semibold text-white"
                          style={
                            n.actor?.avatar_url
                              ? {
                                  backgroundImage: `url(${n.actor.avatar_url})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }
                              : undefined
                          }
                        >
                          {!n.actor?.avatar_url && initialsOf(n.actor)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-muted-foreground">
                          {iconFor(n.type)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[13px]",
                            isUnread
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="line-clamp-2 text-[12px] text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {relativeTime(n.created_at)}
                        </p>
                      </div>
                      {isUnread && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-right">
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
