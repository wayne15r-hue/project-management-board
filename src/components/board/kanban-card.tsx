"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday } from "date-fns";
import { Calendar, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Card } from "@/types";

interface KanbanCardProps {
  card: Card;
  onClick: () => void;
  onDelete?: (cardId: string) => void;
  isDragOverlay?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#27AE60",
  medium: "#F2994A",
  high: "#EB5757",
};

export function KanbanCard({ card, onClick, onDelete, isDragOverlay }: KanbanCardProps) {
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    borderLeftColor: PRIORITY_COLORS[card.priority] || "transparent",
    borderLeftWidth: "3px",
  };

  const dueDate = card.due_date ? new Date(card.due_date) : null;
  const overdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const descPreview = card.description?.split("\n")[0];

  if (isDragging && !isDragOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, borderLeftColor: "transparent", borderLeftWidth: 0 }}
        className="mx-1.5 my-1 h-16 rounded-lg border border-dashed border-foreground/20 bg-foreground/[0.03]"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group/card relative mx-1.5 my-1 cursor-pointer rounded-lg border border-[rgba(0,0,0,0.06)] bg-card px-[14px] py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
        isDragOverlay && "rotate-[2deg] opacity-85 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      )}
      onClick={onClick}
    >
      {/* Quick actions */}
      {!isDragOverlay && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md bg-card/95 px-0.5 py-0.5 opacity-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition-opacity group-hover/card:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground"
            aria-label="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(card.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <p className="line-clamp-2 pr-10 text-[14px] font-medium leading-snug text-[#37352F]">
        {card.title}
      </p>
      {descPreview && (
        <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-[#787774]">
          {descPreview}
        </p>
      )}

      {(dueDate || card.assignee) && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium",
                  overdue
                    ? "bg-[#EB5757]/10 text-[#EB5757]"
                    : "bg-black/[0.04] text-muted-foreground"
                )}
              >
                <Calendar className="h-3 w-3" />
                {format(dueDate, "MMM d")}
              </span>
            )}
          </div>
          {card.assignee && (
            <Avatar className="h-6 w-6 shrink-0 border border-border">
              <AvatarFallback className="bg-[#7CAFC4] text-[10px] font-semibold text-white">
                {card.assignee.full_name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() ||
                  card.assignee.email?.charAt(0).toUpperCase() ||
                  "?"}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
    </div>
  );
}
