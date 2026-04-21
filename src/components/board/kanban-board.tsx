"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { CardDetailDialog } from "./card-detail-dialog";
import { AICreateBar } from "@/components/ai/ai-create-bar";
import { useBoardStore } from "@/stores/board-store";
import { useAppStore } from "@/stores/app-store";
import { isViewActive } from "@/lib/board-filters";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SearchX } from "lucide-react";
import type { Card, Column, Profile, BoardWithDetails } from "@/types";

interface KanbanBoardProps {
  board: BoardWithDetails;
  members: Profile[];
  onRefresh: () => void;
}

export function KanbanBoard({ board, members, onRefresh }: KanbanBoardProps) {
  const [columns, setColumns] = useState(board.columns);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setDragState, filters, sorts, search, clearFilters, clearSorts, setSearch } = useBoardStore();
  const newCardRequestId = useAppStore((s) => s.newCardRequestId);
  const supabase = createClient();

  // Sync local columns when board prop changes (filters, realtime, etc.)
  useEffect(() => {
    setColumns(board.columns);
  }, [board.columns]);

  // Cmd+N -> quick-create a card in the first column
  useEffect(() => {
    if (newCardRequestId === 0) return;
    const first = board.columns[0];
    if (!first) return;
    handleAddCard(first.id, "Untitled");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newCardRequestId]);

  const viewActive = isViewActive(filters, sorts, search);
  const totalVisibleCards = columns.reduce((n, c) => n + c.cards.length, 0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const findColumnByCardId = useCallback(
    (cardId: string) => {
      return columns.find((col) =>
        col.cards.some((card) => card.id === cardId)
      );
    },
    [columns]
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const card = active.data.current?.card as Card | undefined;
    if (card) {
      setActiveCard(card);
      setDragState(card.id, card.column_id);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumn = findColumnByCardId(activeId);
    let overColumn: (Column & { cards: Card[] }) | undefined;

    // Check if over a column directly
    if (overId.startsWith("column-")) {
      const colId = overId.replace("column-", "");
      overColumn = columns.find((c) => c.id === colId);
    } else {
      overColumn = findColumnByCardId(overId);
    }

    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id)
      return;

    setColumns((prev) => {
      const activeCards = [...activeColumn.cards];
      const overCards = [...overColumn!.cards];
      const activeIndex = activeCards.findIndex((c) => c.id === activeId);

      const [movedCard] = activeCards.splice(activeIndex, 1);
      movedCard.column_id = overColumn!.id;

      const overIndex = overId.startsWith("column-")
        ? overCards.length
        : overCards.findIndex((c) => c.id === overId);

      overCards.splice(overIndex, 0, movedCard);

      return prev.map((col) => {
        if (col.id === activeColumn.id) return { ...col, cards: activeCards };
        if (col.id === overColumn!.id) return { ...col, cards: overCards };
        return col;
      });
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    setDragState(null, null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const column = findColumnByCardId(activeId);
    if (!column) return;

    // Reorder within same column
    if (!overId.startsWith("column-")) {
      const overColumn = findColumnByCardId(overId);
      if (column.id === overColumn?.id) {
        const cards = [...column.cards];
        const oldIndex = cards.findIndex((c) => c.id === activeId);
        const newIndex = cards.findIndex((c) => c.id === overId);
        if (oldIndex !== newIndex) {
          const [moved] = cards.splice(oldIndex, 1);
          cards.splice(newIndex, 0, moved);
          setColumns((prev) =>
            prev.map((col) =>
              col.id === column.id ? { ...col, cards } : col
            )
          );
        }
      }
    }

    // Persist positions to database
    try {
      // Update all card positions in affected columns
      const affectedColumnIds = new Set<string>();
      affectedColumnIds.add(active.data.current?.card?.column_id);
      const currentColumn = findColumnByCardId(activeId);
      if (currentColumn) affectedColumnIds.add(currentColumn.id);

      for (const colId of affectedColumnIds) {
        const col = columns.find((c) => c.id === colId);
        if (!col) continue;
        const updates = col.cards.map((card, index) =>
          supabase
            .from("cards")
            .update({
              position: index,
              column_id: colId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", card.id)
        );
        await Promise.all(updates);
      }
    } catch {
      toast.error("Failed to save card position");
      onRefresh();
    }
  }

  async function handleAddCard(columnId: string, title: string) {
    try {
      const res = await fetch(`/api/boards/${board.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId, title }),
      });
      if (!res.ok) throw new Error("Failed to create card");
      const newCard = await res.json();

      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId
            ? { ...col, cards: [...col.cards, newCard] }
            : col
        )
      );
      toast.success("Card created");
    } catch {
      toast.error("Failed to create card");
    }
  }

  async function handleUpdateCard(cardId: string, data: Partial<Card>) {
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update card");
      const updatedCard = await res.json();

      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          cards: col.id === updatedCard.column_id
            ? col.cards.some((c) => c.id === cardId)
              ? col.cards.map((c) => (c.id === cardId ? updatedCard : c))
              : [...col.cards, updatedCard]
            : col.cards.filter((c) => c.id !== cardId),
        }))
      );
    } catch {
      toast.error("Failed to update card");
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete card");

      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.filter((c) => c.id !== cardId),
        }))
      );
      toast.success("Card deleted");
    } catch {
      toast.error("Failed to delete card");
    }
  }

  async function handleRenameColumn(columnId: string, name: string) {
    try {
      await fetch(`/api/boards/${board.id}/columns`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: [{ id: columnId, name }] }),
      });
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId ? { ...col, name } : col
        )
      );
    } catch {
      toast.error("Failed to rename column");
    }
  }

  async function handleDeleteColumn(columnId: string) {
    if (columns.length <= 1) {
      toast.error("Cannot delete the last column");
      return;
    }
    try {
      const res = await fetch(`/api/boards/${board.id}/columns`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId }),
      });
      if (!res.ok) throw new Error("Failed to delete column");
      onRefresh();
    } catch {
      toast.error("Failed to delete column");
    }
  }

  return (
    <>
      <AICreateBar board={board} members={members} onCreated={onRefresh} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="relative min-h-0 flex-1">
          {viewActive && totalVisibleCards === 0 && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-background/80 px-8 py-6 text-center backdrop-blur-sm">
                <SearchX className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-[14px] font-medium text-foreground">
                    No cards match your filters
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Try adjusting or clearing active filters.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearFilters();
                    clearSorts();
                    setSearch("");
                  }}
                >
                  Clear all
                </Button>
              </div>
            </div>
          )}
          <div className="flex h-full gap-3 overflow-x-auto px-6 py-5">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                allColumns={columns}
                onAddCard={handleAddCard}
                onCardClick={(card) => {
                  setSelectedCard(card);
                  setDialogOpen(true);
                }}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
                onRenameColumn={handleRenameColumn}
                onDeleteColumn={handleDeleteColumn}
              />
            ))}

            {/* Add Column Button */}
            <AddColumnButton boardId={board.id} onRefresh={onRefresh} />
          </div>
          {/* Right edge fade-out */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeCard && (
            <KanbanCard
              card={activeCard}
              onClick={() => {}}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      <CardDetailDialog
        card={selectedCard}
        board={board}
        columns={columns}
        members={members}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdate={handleUpdateCard}
        onDelete={handleDeleteCard}
        onNavigate={(dir) => {
          if (!selectedCard) return;
          const flat = columns.flatMap((c) => c.cards);
          const i = flat.findIndex((c) => c.id === selectedCard.id);
          if (i === -1) return;
          const next = dir === "next" ? flat[i + 1] : flat[i - 1];
          if (next) setSelectedCard(next);
        }}
      />
    </>
  );
}

function AddColumnButton({
  boardId,
  onRefresh,
}: {
  boardId: string;
  onRefresh: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");

  async function handleAdd() {
    if (!name.trim()) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      setName("");
      setIsAdding(false);
      onRefresh();
    } catch {
      toast.error("Failed to add column");
    }
  }

  if (isAdding) {
    return (
      <div className="h-full w-[300px] shrink-0 space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Column name..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-foreground/20"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") {
              setIsAdding(false);
              setName("");
            }
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAdd}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsAdding(false);
              setName("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className="flex h-10 w-[300px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[13px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground"
    >
      + Add Column
    </button>
  );
}
