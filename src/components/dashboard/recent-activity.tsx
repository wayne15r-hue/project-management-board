"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Activity, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { describeActivity } from "@/lib/activity";
import type { Profile } from "@/types";

interface ActivityItem {
  id: string;
  action: string;
  changes: Record<string, unknown> | null;
  created_at: string;
  card_id: string;
  actor: Profile | null;
  card: { id: string; title: string; board_id: string } | null;
}

export function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/activity");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setItems(data.items ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Activity
        </h2>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              No activity yet — create a board and add some cards.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const actorName =
                item.actor?.full_name || item.actor?.email || "Someone";
              const text =
                item.action === "commented"
                  ? `${actorName} commented on "${item.card?.title || "a card"}"`
                  : describeActivity(item.action, item.changes, actorName);
              const initials =
                (item.actor?.full_name || item.actor?.email || "?")
                  .split(/\s+|@/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() ?? "")
                  .join("") || "?";
              return (
                <li key={item.id}>
                  <Link
                    href={
                      item.card?.board_id
                        ? `/dashboard/board/${item.card.board_id}`
                        : "/dashboard"
                    }
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                      <AvatarFallback className="bg-[#7CAFC4] text-[9px] font-semibold text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground">
                        {text}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
