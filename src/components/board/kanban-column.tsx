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
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50">
      {/* Column Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 min-w-0">
          {column.color && (
            <div
              className="h-3 w-3 rounded-full shrink-0"
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
              className="h-6 text-sm font-semibold"
              autoFocus
            />
          ) : (
            <h3 className="text-sm font-semibold truncate">{column.name}</h3>
          )}
          <span className="text-xs text-muted-foreground shrink-0">
            {column.cards.length}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-6 w-6 hover:bg-accent hover:text-accent-foreground">
            <MoreHorizontal className="h-4 w-4" />
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

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto p-2 min-h-[60px]",
          isOver && "bg-accent/50 rounded-md"
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
      <div className="p-2">
        {isAdding ? (
          <div className="space-y-2">
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
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add a card
          </Button>
        )}
      </div>
    </div>
  );
}
