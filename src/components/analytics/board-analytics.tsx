"use client";

import { useMemo } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { CheckCircle2, Clock, AlertTriangle, Users } from "lucide-react";
import type { BoardWithDetails, Card, Priority, Profile } from "@/types";

interface BoardAnalyticsProps {
  board: BoardWithDetails;
  members: Profile[];
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "#EB5757",
  medium: "#F2994A",
  low: "#27AE60",
};

const ACCENT_PALETTE = [
  "#7CAFC4",
  "#9B8FBF",
  "#E8A87C",
  "#8BAE68",
  "#C68FBF",
  "#D9A86C",
  "#7CC4B8",
  "#B8907C",
];

function flattenCards(board: BoardWithDetails): Card[] {
  return board.columns.flatMap((c) => c.cards);
}

export function BoardAnalytics({ board, members }: BoardAnalyticsProps) {
  const cards = useMemo(() => flattenCards(board), [board]);
  const totalCards = cards.length;

  const lastColumn = board.columns[board.columns.length - 1];
  const doneCount = lastColumn
    ? lastColumn.cards.length
    : 0;
  const completionRate =
    totalCards > 0 ? Math.round((doneCount / totalCards) * 100) : 0;

  const overdue = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return cards.filter(
      (c) =>
        c.due_date &&
        new Date(c.due_date).getTime() < today &&
        c.column_id !== lastColumn?.id
    ).length;
  }, [cards, lastColumn]);

  const unassigned = cards.filter((c) => !c.assignee_id).length;

  const byColumn = useMemo(
    () =>
      board.columns.map((col) => ({
        id: col.id,
        name: col.name,
        count: col.cards.length,
        color: col.color || "#9B8FBF",
      })),
    [board.columns]
  );

  const byPriority = useMemo(() => {
    const buckets: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
    for (const c of cards) buckets[c.priority] = (buckets[c.priority] ?? 0) + 1;
    return (Object.keys(buckets) as Priority[]).map((p) => ({
      label: p[0].toUpperCase() + p.slice(1),
      key: p,
      count: buckets[p],
      color: PRIORITY_COLORS[p],
    }));
  }, [cards]);

  const byAssignee = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) {
      const key = c.assignee_id ?? "_unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count], i) => {
        const member = members.find((m) => m.id === key);
        return {
          id: key,
          name:
            key === "_unassigned"
              ? "Unassigned"
              : member?.full_name || member?.email || "Unknown",
          count,
          color: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [cards, members]);

  const byLabel = useMemo(() => {
    const counts = new Map<string, { name: string; color: string; count: number }>();
    for (const c of cards) {
      for (const cl of c.card_labels ?? []) {
        const lab = cl.label;
        if (!lab) continue;
        const cur = counts.get(lab.id);
        if (cur) cur.count += 1;
        else counts.set(lab.id, { name: lab.name, color: lab.color, count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [cards]);

  const last7 = useMemo(() => {
    const days: { date: Date; label: string; created: number; done: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({ date: d, label: format(d, "EEE"), created: 0, done: 0 });
    }
    for (const c of cards) {
      const created = startOfDay(new Date(c.created_at)).getTime();
      const updated = startOfDay(new Date(c.updated_at)).getTime();
      const inDone = c.column_id === lastColumn?.id;
      for (const day of days) {
        if (created === day.date.getTime()) day.created += 1;
        if (inDone && updated === day.date.getTime()) day.done += 1;
      }
    }
    return days;
  }, [cards, lastColumn]);

  const maxLast7 = Math.max(1, ...last7.map((d) => Math.max(d.created, d.done)));

  return (
    <div className="flex-1 overflow-auto px-4 py-5 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Total cards"
            value={totalCards}
            icon={<Clock className="h-4 w-4" />}
            tint="#7CAFC4"
          />
          <KpiCard
            label="Completed"
            value={doneCount}
            sub={`${completionRate}% of board`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tint="#8BAE68"
          />
          <KpiCard
            label="Overdue"
            value={overdue}
            icon={<AlertTriangle className="h-4 w-4" />}
            tint={overdue > 0 ? "#EB5757" : "#9B8FBF"}
          />
          <KpiCard
            label="Unassigned"
            value={unassigned}
            icon={<Users className="h-4 w-4" />}
            tint="#E8A87C"
          />
        </div>

        {/* Cards by status */}
        <Panel title="Cards by status">
          {totalCards === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {byColumn.map((col) => {
                const pct = totalCards
                  ? Math.round((col.count / totalCards) * 100)
                  : 0;
                return (
                  <div key={col.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                        {col.name}
                      </span>
                      <span className="text-muted-foreground">
                        {col.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: col.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Priority donut */}
          <Panel title="Cards by priority">
            {totalCards === 0 ? (
              <EmptyState />
            ) : (
              <PriorityDonut data={byPriority} total={totalCards} />
            )}
          </Panel>

          {/* Assignee bar chart */}
          <Panel title="Cards by assignee">
            {byAssignee.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2.5">
                {byAssignee.map((a) => {
                  const max = Math.max(...byAssignee.map((x) => x.count), 1);
                  const w = Math.round((a.count / max) * 100);
                  return (
                    <div key={a.id} className="space-y-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="truncate font-medium text-foreground">
                          {a.name}
                        </span>
                        <span className="text-muted-foreground">{a.count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{ width: `${w}%`, backgroundColor: a.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Label distribution */}
        {byLabel.length > 0 && (
          <Panel title="Cards by label">
            <div className="space-y-2.5">
              {byLabel.map((l) => {
                const max = Math.max(...byLabel.map((x) => x.count), 1);
                const w = Math.round((l.count / max) * 100);
                return (
                  <div key={l.name} className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 truncate font-medium text-foreground">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.name}
                      </span>
                      <span className="text-muted-foreground">{l.count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${w}%`, backgroundColor: l.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* 7-day trend */}
        <Panel title="Last 7 days">
          <div className="mb-3 flex items-center gap-4 text-[12px]">
            <LegendDot color="#7CAFC4" label="Created" />
            <LegendDot color="#8BAE68" label="Completed" />
          </div>
          <TrendChart days={last7} max={maxLast7} />
        </Panel>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tint,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: `${tint}1A`, color: tint }}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none text-foreground">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function EmptyState() {
  return (
    <p className="py-6 text-center text-[13px] text-muted-foreground">
      No data yet — add some cards to see analytics.
    </p>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function PriorityDonut({
  data,
  total,
}: {
  data: { label: string; count: number; color: string; key: Priority }[];
  total: number;
}) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="14"
            className="text-muted opacity-40"
          />
          {data.map((d) => {
            if (d.count === 0) return null;
            const len = (d.count / total) * circumference;
            const dasharray = `${len} ${circumference - len}`;
            const dashoffset = -offset;
            offset += len;
            return (
              <circle
                key={d.key}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
                className="transition-all duration-500 ease-out"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-bold leading-none text-foreground">
            {total}
          </span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">
            cards
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {data.map((d) => {
          const pct = total ? Math.round((d.count / total) * 100) : 0;
          return (
            <div
              key={d.key}
              className="flex items-center justify-between text-[12px]"
            >
              <span className="flex items-center gap-2 text-foreground">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: d.color }}
                />
                {d.label}
              </span>
              <span className="text-muted-foreground">
                {d.count} • {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendChart({
  days,
  max,
}: {
  days: { label: string; created: number; done: number }[];
  max: number;
}) {
  const w = 560;
  const h = 160;
  const pad = { l: 28, r: 12, t: 12, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const stepX = innerW / Math.max(days.length - 1, 1);
  const yFor = (v: number) => pad.t + innerH - (v / max) * innerH;

  function points(values: number[]) {
    return values
      .map((v, i) => `${pad.l + i * stepX},${yFor(v)}`)
      .join(" ");
  }

  const created = days.map((d) => d.created);
  const done = days.map((d) => d.done);

  const gridLines = [0.25, 0.5, 0.75, 1].map((t) => pad.t + innerH * t);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-44 w-full min-w-[420px]"
      >
        {gridLines.map((y, i) => (
          <line
            key={i}
            x1={pad.l}
            x2={w - pad.r}
            y1={y}
            y2={y}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="2 4"
          />
        ))}
        {/* y axis labels */}
        {[0, 1].map((t) => {
          const v = Math.round(max * (1 - t));
          const y = pad.t + innerH * t;
          return (
            <text
              key={t}
              x={pad.l - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {v}
            </text>
          );
        })}
        {/* x axis labels */}
        {days.map((d, i) => (
          <text
            key={d.label + i}
            x={pad.l + i * stepX}
            y={h - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {d.label}
          </text>
        ))}
        <polyline
          points={points(created)}
          fill="none"
          stroke="#7CAFC4"
          strokeWidth="2"
        />
        <polyline
          points={points(done)}
          fill="none"
          stroke="#8BAE68"
          strokeWidth="2"
        />
        {created.map((v, i) => (
          <circle
            key={`c-${i}`}
            cx={pad.l + i * stepX}
            cy={yFor(v)}
            r={3}
            fill="#7CAFC4"
          />
        ))}
        {done.map((v, i) => (
          <circle
            key={`d-${i}`}
            cx={pad.l + i * stepX}
            cy={yFor(v)}
            r={3}
            fill="#8BAE68"
          />
        ))}
      </svg>
    </div>
  );
}

