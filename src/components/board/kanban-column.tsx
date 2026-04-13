"use client";

import { useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./kanban-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  onAddCard: (columnId: string, title: string) => void;
  onCardClick: (card: Card) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function KanbanColumn({
  column,
  onAddCard,
  onCardClick,
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
    if (!newCardTitle.trim()) return;
    onAddCard(column.id, newCardTitle.trim());
    setNewCardTitle("");
    setIsAdding(false);
  }

  function handleRename() {
    if (editName.trim() && editName.trim() !== column.name) {
      onRenameColumn(column.id, editName.trim());
    }
    setIsEditing(false);
  }

  const cardIds = column.cards.map((c) => c.id);

  return (
    <div className="group/col flex w-[280px] shrink-0 flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {column.color && (
            <div
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
              className="h-6 border-0 bg-transparent px-0 text-[13px] font-semibold shadow-none focus-visible:ring-0"
              autoFocus
            />
          ) : (
            <h3
              onClick={() => setIsEditing(true)}
              className="cursor-text truncate text-[13px] font-semibold uppercase tracking-wide text-foreground"
            >
              {column.name}
            </h3>
          )}
          <span className="shrink-0 text-[12px] font-medium text-muted-foreground">
            {column.cards.length}
          </span>
        </div>
        <div className="flex items-center opacity-0 transition-opacity group-hover/col:opacity-100">
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Add card"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
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

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 rounded-md px-1 py-1 min-h-[60px] transition-colors",
          isOver && "bg-accent/50"
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onClick={() => onCardClick(card)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add Card */}
      <div className="px-1 pt-1 pb-2">
        {isAdding ? (
          <div className="space-y-2 rounded-md border border-border bg-card p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <Input
              placeholder="Card title..."
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCard();
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewCardTitle("");
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddCard}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAdding(false);
                  setNewCardTitle("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        )}
      </div>
    </div>
  );
}
