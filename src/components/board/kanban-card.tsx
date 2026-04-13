"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday } from "date-fns";
import { Calendar } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Card } from "@/types";

interface KanbanCardProps {
  card: Card;
  onClick: () => void;
  isDragOverlay?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#8BAE68",
  medium: "#E8A87C",
  high: "#D4553E",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function KanbanCard({ card, onClick, isDragOverlay }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: {
      type: "card",
      card,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: PRIORITY_COLORS[card.priority] || "transparent",
    borderLeftWidth: "3px",
  };

  const dueDate = card.due_date ? new Date(card.due_date) : null;
  const overdue = dueDate && isPast(dueDate) && !isToday(dueDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[#C9C8C3] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)]",
        isDragging && "opacity-40",
        isDragOverlay && "rotate-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      )}
      onClick={onClick}
    >
      <p className="text-[14px] font-medium leading-snug text-foreground">
        {card.title}
      </p>
      {card.description && (
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {card.description}
        </p>
      )}

      {(card.priority || dueDate) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {card.priority && (
            <span
              className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${PRIORITY_COLORS[card.priority]}1A`,
                color: PRIORITY_COLORS[card.priority],
              }}
            >
              {PRIORITY_LABELS[card.priority]}
            </span>
          )}
          {dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                overdue ? "text-[#D4553E]" : "text-muted-foreground"
              )}
            >
              <Calendar className="h-3 w-3" />
              {format(dueDate, "MMM d")}
            </span>
          )}
        </div>
      )}

      {card.assignee && (
        <div className="mt-2.5 flex items-center justify-end">
          <Avatar className="h-5 w-5 border border-border">
            <AvatarFallback className="bg-[#7CAFC4] text-[9px] font-semibold text-white">
              {card.assignee.full_name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase() ||
                card.assignee.email?.charAt(0).toUpperCase() ||
                "?"}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
    </div>
  );
}
