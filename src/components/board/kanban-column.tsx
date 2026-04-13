"use client";

import { useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./kanban-card";
import { Input } from "@/components/ui/input";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Card, Column } from "@/types";

interface KanbanColumnProps {
  column: Column & { cards: Card[] };
  allColumns: Column[];
  onAddCard: (columnId: string, title: string) => void;
  onCardClick: (card: Card) => void;
  onUpdateCard: (cardId: string, data: Partial<Card>) => void;
  onDeleteCard: (cardId: string) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function KanbanColumn({
  column,
  allColumns,
  onAddCard,
  onCardClick,
  onUpdateCard,
  onDeleteCard,
  onRenameColumn,
  onDeleteColumn,
}: KanbanColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: {
      type: "column",
      column,
    },
  });

  function handleAddCard() {
    if (!newCardTitle.trim()) {
      setIsAdding(false);
      return;
    }
    onAddCard(column.id, newCardTitle.trim());
    setNewCardTitle("");
  }

  function handleRename() {
    if (editName.trim() && editName.trim() !== column.name) {
      onRenameColumn(column.id, editName.trim());
    }
    setIsEditing(false);
  }

  const cardIds = column.cards.map((c) => c.id);

  return (
    <div
      className={cn(
        "group/col flex h-full w-[300px] shrink-0 flex-col rounded-lg border bg-[rgba(0,0,0,0.02)] transition-colors",
        isOver
          ? "border-foreground/20 bg-foreground/[0.04]"
          : "border-[rgba(0,0,0,0.04)]"
      )}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg bg-[rgba(251,251,250,0.85)] px-3 py-2.5 backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {column.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: column.color }}
            />
          )}
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setEditName(column.name);
                  setIsEditing(false);
                }
              }}
              className="h-6 border-0 bg-transparent px-0 text-[14px] font-semibold shadow-none focus-visible:ring-0"
              autoFocus
            />
          ) : (
            <h3
              onClick={() => setIsEditing(true)}
              className="cursor-text truncate text-[14px] font-semibold text-foreground"
            >
              {column.name}
            </h3>
          )}
          <span className="shrink-0 text-[12px] font-medium text-muted-foreground">
            {column.cards.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/col:opacity-100">
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-black/5 hover:text-foreground"
            aria-label="Add card"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-black/5 hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDeleteColumn(column.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cards scroll area */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-1.5 pb-1"
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              columns={allColumns}
              onClick={() => onCardClick(card)}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>

        {column.cards.length === 0 && !isAdding && (
          <div className="flex items-center justify-center py-8">
            <p className="text-[12px] text-muted-foreground/60">
              No cards yet
            </p>
          </div>
        )}

        {isAdding && (
          <div className="mx-1.5 my-1 rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <textarea
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddCard();
                }
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewCardTitle("");
                }
              }}
              onBlur={() => {
                if (!newCardTitle.trim()) setIsAdding(false);
              }}
              placeholder="Card title…"
              rows={2}
              autoFocus
              className="w-full resize-none border-0 bg-transparent p-0 text-[14px] font-medium leading-snug text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Enter to save · Esc to cancel</span>
            </div>
          </div>
        )}
      </div>

      {/* Add card button */}
      <div className="px-1.5 pt-1 pb-1.5">
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        )}
      </div>
    </div>
  );
}
