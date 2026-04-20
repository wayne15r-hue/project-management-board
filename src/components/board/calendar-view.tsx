"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { CardDetailDialog } from "./card-detail-dialog";
import type { BoardWithDetails, Card, Priority, Profile } from "@/types";

interface CalendarViewProps {
  board: BoardWithDetails;
  members: Profile[];
  onRefresh: () => void;
}

const PRIORITY_BORDER: Record<Priority, string> = {
  high: "#EB5757",
  medium: "#F2994A",
  low: "#27AE60",
};

const PRIORITY_TINT: Record<Priority, string> = {
  high: "#EB575715",
  medium: "#F2994A15",
  low: "#27AE6015",
};

function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function CalendarView({ board, members, onRefresh }: CalendarViewProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const allCards = useMemo(
    () => board.columns.flatMap((c) => c.cards),
    [board.columns]
  );

  const cardsByDay = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of allCards) {
      if (!card.due_date) continue;
      const k = dayKey(parseISO(card.due_date));
      const arr = map.get(k) ?? [];
      arr.push(card);
      map.set(k, arr);
    }
    return map;
  }, [allCards]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const list: Date[] = [];
    const d = new Date(start);
    while (d <= end) {
      list.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [cursor]);

  const today = new Date();
  const firstColumnId = board.columns[0]?.id;

  async function handleUpdateCard(cardId: string, data: Partial<Card>) {
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch {
      toast.error("Failed to update card");
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onRefresh();
      setDialogOpen(false);
    } catch {
      toast.error("Failed to delete card");
    }
  }

  async function handleCreateOnDay(date: Date) {
    if (!firstColumnId) {
      toast.error("Add a column first");
      return;
    }
    const title = window.prompt("New card title:");
    if (!title?.trim()) return;
    try {
      const res = await fetch(`/api/boards/${board.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnId: firstColumnId,
          title: title.trim(),
          priority: "medium",
          due_date: format(date, "yyyy-MM-dd"),
        }),
      });
      if (!res.ok) throw new Error();
      onRefresh();
      toast.success("Card created");
    } catch {
      toast.error("Failed to create card");
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-[160px] text-center text-[15px] font-semibold text-foreground">
            {format(cursor, "MMMM yyyy")}
          </h2>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="rounded-md border border-border px-3 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Today
        </button>
      </div>

      {/* Desktop grid */}
      <div className="hidden flex-1 overflow-auto md:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(120px,1fr)]">
          {days.map((d) => {
            const k = dayKey(d);
            const inMonth = isSameMonth(d, cursor);
            const isToday = isSameDay(d, today);
            const dayCards = cardsByDay.get(k) ?? [];
            const showAll = expandedDay === k;
            const visible = showAll ? dayCards : dayCards.slice(0, 3);
            const hidden = dayCards.length - visible.length;

            return (
              <div
                key={k}
                className={`group relative flex flex-col gap-1 border-b border-r border-border p-1.5 ${
                  isToday ? "bg-indigo-50/60 dark:bg-indigo-500/10" : ""
                } ${
                  isWeekend(d) && !isToday ? "bg-muted/20" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[12px] ${
                      isToday
                        ? "font-bold text-indigo-600 dark:text-indigo-300"
                        : inMonth
                        ? "font-medium text-foreground"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {format(d, "d")}
                  </span>
                  {inMonth && (
                    <button
                      type="button"
                      onClick={() => handleCreateOnDay(d)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Add card"
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {visible.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        setSelectedCard(card);
                        setDialogOpen(true);
                      }}
                      className="truncate rounded-sm border-l-2 px-1.5 py-0.5 text-left text-[11px] text-foreground transition-colors hover:bg-accent"
                      style={{
                        borderLeftColor: PRIORITY_BORDER[card.priority],
                        backgroundColor: PRIORITY_TINT[card.priority],
                      }}
                      title={card.title}
                    >
                      {card.title}
                    </button>
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(k)}
                      className="text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      +{hidden} more
                    </button>
                  )}
                  {showAll && dayCards.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(null)}
                      className="text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile list view */}
      <div className="flex-1 overflow-auto md:hidden">
        <div className="space-y-4 p-4">
          {days
            .filter((d) => isSameMonth(d, cursor))
            .reduce<{ week: number; days: Date[] }[]>((acc, d) => {
              const wk = Math.floor(
                (d.getTime() - startOfMonth(cursor).getTime()) /
                  (7 * 24 * 60 * 60 * 1000)
              );
              const last = acc[acc.length - 1];
              if (last && last.week === wk) last.days.push(d);
              else acc.push({ week: wk, days: [d] });
              return acc;
            }, [])
            .map((wk) => (
              <div key={wk.week}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Week of {format(wk.days[0], "MMM d")}
                </h3>
                <div className="space-y-2">
                  {wk.days.map((d) => {
                    const dayCards = cardsByDay.get(dayKey(d)) ?? [];
                    if (dayCards.length === 0) return null;
                    return (
                      <div
                        key={dayKey(d)}
                        className="rounded-md border border-border bg-card p-3"
                      >
                        <p className="mb-2 text-[12px] font-semibold text-foreground">
                          {format(d, "EEE, MMM d")}
                        </p>
                        <div className="space-y-1">
                          {dayCards.map((card) => (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => {
                                setSelectedCard(card);
                                setDialogOpen(true);
                              }}
                              className="w-full truncate rounded-sm border-l-2 px-2 py-1 text-left text-[12px] text-foreground"
                              style={{
                                borderLeftColor: PRIORITY_BORDER[card.priority],
                                backgroundColor: PRIORITY_TINT[card.priority],
                              }}
                            >
                              {card.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>

      <CardDetailDialog
        card={selectedCard}
        board={board}
        columns={board.columns}
        members={members}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdate={handleUpdateCard}
        onDelete={handleDeleteCard}
      />
    </div>
  );
}
