"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Calendar, GripVertical } from "lucide-react";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Card } from "@/types";

interface KanbanCardProps {
  card: Card;
  onClick: () => void;
  isDragOverlay?: boolean;
}

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
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer",
        isDragging && "opacity-50",
        isDragOverlay && "shadow-lg rotate-2"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{card.title}</p>
          {card.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {card.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={card.priority} />
            {card.due_date && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(new Date(card.due_date), "MMM d")}
              </span>
            )}
          </div>
          {card.assignee && (
            <div className="mt-2 flex items-center gap-1.5">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[10px]">
                  {card.assignee.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate">
                {card.assignee.full_name || card.assignee.email}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
