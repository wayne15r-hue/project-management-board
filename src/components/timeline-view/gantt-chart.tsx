"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  differenceInDays,
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  startOfDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { BoardWithDetails, Card, Priority } from "@/types";

interface GanttChartProps {
  board: BoardWithDetails;
}

type ZoomLevel = "day" | "week" | "month";

const priorityColors: Record<Priority, string> = {
  low: "bg-[#27AE60]",
  medium: "bg-[#F2994A]",
  high: "bg-[#EB5757]",
};

export function GanttChart({ board }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("day");

  const allCards = useMemo(
    () => board.columns.flatMap((col) => col.cards),
    [board.columns]
  );

  const { timelineStart, timelineEnd, days } = useMemo(() => {
    if (allCards.length === 0) {
      const today = startOfDay(new Date());
      return {
        timelineStart: addDays(today, -7),
        timelineEnd: addDays(today, 30),
        days: eachDayOfInterval({
          start: addDays(today, -7),
          end: addDays(today, 30),
        }),
      };
    }

    let earliest = new Date();
    let latest = new Date();

    allCards.forEach((card) => {
      const start = card.start_date
        ? new Date(card.start_date)
        : new Date(card.created_at);
      const end = card.due_date ? new Date(card.due_date) : start;

      if (start < earliest) earliest = start;
      if (end > latest) latest = end;
    });

    const padded = {
      start: startOfWeek(addDays(earliest, -7)),
      end: endOfWeek(addDays(latest, 14)),
    };

    return {
      timelineStart: padded.start,
      timelineEnd: padded.end,
      days: eachDayOfInterval(padded),
    };
  }, [allCards]);

  const dayWidth = zoom === "day" ? 40 : zoom === "week" ? 20 : 8;

  function getBarStyle(card: Card) {
    const start = card.start_date
      ? startOfDay(new Date(card.start_date))
      : startOfDay(new Date(card.created_at));
    const end = card.due_date
      ? startOfDay(new Date(card.due_date))
      : start;

    const startOffset = differenceInDays(start, timelineStart);
    const duration = Math.max(differenceInDays(end, start) + 1, 1);

    return {
      left: startOffset * dayWidth,
      width: duration * dayWidth,
    };
  }

  const todayOffset = differenceInDays(startOfDay(new Date()), timelineStart);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b">
        <span className="text-sm text-muted-foreground mr-2">Zoom:</span>
        <Button
          variant={zoom === "month" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setZoom("month")}
        >
          Month
        </Button>
        <Button
          variant={zoom === "week" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setZoom("week")}
        >
          Week
        </Button>
        <Button
          variant={zoom === "day" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setZoom("day")}
        >
          Day
        </Button>
      </div>

      {/* Chart */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-w-max">
          {/* Card Titles (sticky left) */}
          <div className="sticky left-0 z-10 w-64 shrink-0 bg-background border-r">
            {/* Header row */}
            <div className="h-16 border-b flex items-end px-3 pb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Card
              </span>
            </div>
            {/* Group by column */}
            {board.columns.map((col) => (
              <div key={col.id}>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                  {col.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                  )}
                  <span className="text-xs font-semibold">{col.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({col.cards.length})
                  </span>
                </div>
                {col.cards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center gap-2 px-3 h-10 border-b text-sm truncate"
                  >
                    <span className="truncate">{card.title}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Timeline Area */}
          <div className="flex-1">
            {/* Date headers */}
            <div className="h-16 border-b flex items-end relative">
              {days.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    "shrink-0 flex flex-col items-center justify-end pb-1 border-r",
                    isToday(day) && "bg-primary/5"
                  )}
                  style={{ width: dayWidth }}
                >
                  {(zoom === "day" || day.getDate() === 1 || i === 0) && (
                    <>
                      {(day.getDate() === 1 || i === 0) && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(day, "MMM")}
                        </span>
                      )}
                      {zoom === "day" && (
                        <span
                          className={cn(
                            "text-[10px]",
                            isToday(day)
                              ? "text-primary font-bold"
                              : "text-muted-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Rows */}
            {board.columns.map((col) => (
              <div key={col.id}>
                {/* Group header */}
                <div
                  className="h-[34px] bg-muted/50 border-b"
                  style={{ width: days.length * dayWidth }}
                />
                {/* Card bars */}
                {col.cards.map((card) => {
                  const { left, width } = getBarStyle(card);
                  return (
                    <div
                      key={card.id}
                      className="relative h-10 border-b"
                      style={{ width: days.length * dayWidth }}
                    >
                      {/* Today line */}
                      {todayOffset >= 0 && todayOffset < days.length && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                          style={{ left: todayOffset * dayWidth + dayWidth / 2 }}
                        />
                      )}
                      {/* Bar */}
                      <div
                        className={cn(
                          "absolute top-2 h-6 rounded-md cursor-pointer transition-opacity hover:opacity-80",
                          priorityColors[card.priority]
                        )}
                        style={{ left, width: Math.max(width, dayWidth) }}
                        title={`${card.title}\n${card.start_date ? format(new Date(card.start_date), "MMM d") : "No start"} - ${card.due_date ? format(new Date(card.due_date), "MMM d") : "No due date"}`}
                      >
                        <span className="px-2 text-[10px] text-white font-medium truncate leading-6 block">
                          {zoom !== "month" && card.title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
