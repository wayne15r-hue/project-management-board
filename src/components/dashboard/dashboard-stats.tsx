"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, SquareKanban, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stats {
  totalBoards: number;
  totalCards: number;
  dueThisWeek: number;
  overdue: number;
  teamMembers: number;
}

export function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (!res.ok) return;
        const data = (await res.json()) as Stats;
        if (alive) setStats(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = [
    {
      label: "Total boards",
      value: stats?.totalBoards ?? 0,
      icon: LayoutGrid,
      tint: "#7CAFC4",
    },
    {
      label: "Total cards",
      value: stats?.totalCards ?? 0,
      icon: SquareKanban,
      tint: "#9B8FBF",
    },
    {
      label: "Due this week",
      value: stats?.dueThisWeek ?? 0,
      icon: Calendar,
      tint: stats && stats.overdue > 0 ? "#EB5757" : "#E8A87C",
      hint:
        stats && stats.overdue > 0
          ? `${stats.overdue} overdue`
          : undefined,
    },
    {
      label: "Team members",
      value: stats?.teamMembers ?? 0,
      icon: Users,
      tint: "#8BAE68",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] count-up"
          )}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div
            aria-hidden
            className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20 blur-xl transition-opacity group-hover:opacity-40"
            style={{ backgroundColor: item.tint }}
          />
          <div className="relative flex items-start justify-between">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${item.tint}22`, color: item.tint }}
            >
              <item.icon className="h-4 w-4" />
            </div>
            {item.hint && (
              <span className="rounded-full bg-[#EB5757]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#EB5757]">
                {item.hint}
              </span>
            )}
          </div>
          <div className="relative mt-3">
            {loading ? (
              <div className="skeleton h-7 w-12" />
            ) : (
              <p
                key={item.value}
                className="count-up text-[26px] font-bold leading-none text-foreground"
              >
                {item.value}
              </p>
            )}
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {item.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
