"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday } from "date-fns";
import { Calendar, MoreHorizontal, Pencil, Trash2, Flag, ArrowRight, FileText } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Card, Column, Priority } from "@/types";

interface KanbanCardProps {
  card: Card;
  onClick: () => void;
  columns?: Column[];
  onUpdate?: (cardId: string, data: Partial<Card>) => void;
  onDelete?: (cardId: string) => void;
  isDragOverlay?: boolean;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#27AE60",
  medium: "#F2994A",
  high: "#EB5757",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function KanbanCard({
  card,
  onClick,
  columns = [],
  onUpdate,
  onDelete,
  isDragOverlay,
}: KanbanCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(card.title);

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
    disabled: isEditingTitle,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    borderLeftColor: PRIORITY_COLORS[card.priority] || "transparent",
    borderLeftWidth: "3px",
    borderTopLeftRadius: "8px",
    borderBottomLeftRadius: "8px",
  };

  const dueDate = card.due_date ? new Date(card.due_date) : null;
  const overdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const dueToday = dueDate && isToday(dueDate);
  const descPreview = card.description?.split("\n")[0];

  function commitTitle() {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== card.title) {
      onUpdate?.(card.id, { title: trimmed });
    } else {
      setEditTitle(card.title);
    }
    setIsEditingTitle(false);
  }

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
      {...(isEditingTitle ? {} : attributes)}
      {...(isEditingTitle ? {} : listeners)}
      className={cn(
        "group/card relative mx-1.5 my-1 cursor-pointer rounded-lg border border-border bg-card px-[14px] py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)]",
        isDragOverlay && "rotate-[2deg] opacity-90 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      )}
      onClick={(e) => {
        if (isEditingTitle) return;
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setEditTitle(card.title);
        setIsEditingTitle(true);
      }}
    >
      {/* Quick actions menu */}
      {!isDragOverlay && (columns.length > 0 || onDelete) && (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/card:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-card/95 text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition hover:bg-accent hover:text-foreground"
              aria-label="Card actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={(e) => {
                  e?.stopPropagation?.();
                  onClick();
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              {columns.length > 0 && onUpdate && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRight className="mr-2 h-3.5 w-3.5" />
                    Move to
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {columns
                      .filter((c) => c.id !== card.column_id)
                      .map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          onClick={() => onUpdate(card.id, { column_id: col.id })}
                        >
                          <span
                            className="mr-2 h-2 w-2 rounded-full"
                            style={{ backgroundColor: col.color || "#9B8FBF" }}
                          />
                          {col.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {onUpdate && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag className="mr-2 h-3.5 w-3.5" />
                    Priority
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <DropdownMenuItem
                        key={p}
                        onClick={() => onUpdate(card.id, { priority: p })}
                      >
                        <span
                          className="mr-2 h-2 w-2 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[p] }}
                        />
                        {PRIORITY_LABELS[p]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {onDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Delete this card?")) onDelete(card.id);
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isEditingTitle ? (
        <textarea
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitTitle();
            }
            if (e.key === "Escape") {
              setEditTitle(card.title);
              setIsEditingTitle(false);
            }
          }}
          autoFocus
          rows={2}
          className="w-full resize-none border-0 bg-transparent p-0 pr-10 text-[14px] font-medium leading-snug text-foreground outline-none"
        />
      ) : (
        <p className="line-clamp-2 pr-10 text-[14px] font-medium leading-snug text-foreground">
          {card.title}
        </p>
      )}

      {descPreview && !isEditingTitle && (
        <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-muted-foreground">
          {descPreview}
        </p>
      )}

      {/* Footer metadata */}
      {(dueDate || card.assignee || card.description) && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium",
                  overdue
                    ? "bg-[#EB5757]/10 text-[#EB5757]"
                    : dueToday
                    ? "bg-[#F2994A]/10 text-[#F2994A]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Calendar className="h-3 w-3" />
                {format(dueDate, "MMM d")}
              </span>
            )}
            {card.description && (
              <span
                className="inline-flex items-center text-muted-foreground"
                title="Has description"
              >
                <FileText className="h-3 w-3" />
              </span>
            )}
          </div>
          {card.assignee && (
            <Avatar className="h-[22px] w-[22px] shrink-0 border border-border">
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
          )}
        </div>
      )}
    </div>
  );
}
