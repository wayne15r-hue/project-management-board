"use client";

import { useMemo, useState } from "react";
import { format, isPast, isToday } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Plus, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CardDetailDialog } from "@/components/board/card-detail-dialog";
import {
  useBoardStore,
  type SortField,
  type ViewSort,
} from "@/stores/board-store";
import { isViewActive } from "@/lib/board-filters";
import type { BoardWithDetails, Card, Profile, Priority } from "@/types";

interface TableViewProps {
  board: BoardWithDetails;
  members: Profile[];
  onRefresh: () => void;
}

type FlatCard = Card & { columnName: string; columnColor: string | null };

const PRIORITY_META: Record<Priority, { label: string; bg: string; text: string }> = {
  high: { label: "High", bg: "bg-[#FDECEC]", text: "text-[#C0392B]" },
  medium: { label: "Medium", bg: "bg-[#FDF2E6]", text: "text-[#B85C1C]" },
  low: { label: "Low", bg: "bg-[#E8F5EC]", text: "text-[#1E7F3F]" },
};

type ColKey = "title" | "status" | "priority" | "labels" | "assignee" | "due_date" | "created_at";

const SORTABLE: Partial<Record<ColKey, SortField>> = {
  title: "title",
  priority: "priority",
  due_date: "due_date",
  created_at: "created_at",
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function TableView({ board, members, onRefresh }: TableViewProps) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filters = useBoardStore((s) => s.filters);
  const sorts = useBoardStore((s) => s.sorts);
  const search = useBoardStore((s) => s.search);
  const addSort = useBoardStore((s) => s.addSort);
  const updateSort = useBoardStore((s) => s.updateSort);
  const removeSort = useBoardStore((s) => s.removeSort);
  const clearFilters = useBoardStore((s) => s.clearFilters);
  const clearSorts = useBoardStore((s) => s.clearSorts);
  const setSearch = useBoardStore((s) => s.setSearch);

  const flatCards: FlatCard[] = useMemo(
    () =>
      board.columns.flatMap((col) =>
        col.cards.map((card) => ({
          ...card,
          columnName: col.name,
          columnColor: col.color,
        }))
      ),
    [board.columns]
  );

  const viewActive = isViewActive(filters, sorts, search);

  function activeSort(field: SortField): ViewSort | undefined {
    return sorts.find((s) => s.field === field);
  }

  function handleHeaderSort(col: ColKey) {
    const field = SORTABLE[col];
    if (!field) return;
    const existing = sorts.find((s) => s.field === field);
    if (!existing) {
      addSort({ id: newId(), field, dir: "asc" });
    } else if (existing.dir === "asc") {
      updateSort(existing.id, { dir: "desc" });
    } else {
      removeSort(existing.id);
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
      onRefresh();
    } catch {
      toast.error("Failed to update card");
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete card");
      onRefresh();
    } catch {
      toast.error("Failed to delete card");
    }
  }

  const headers: { key: ColKey; label: string; width?: string }[] = [
    { key: "title", label: "Title" },
    { key: "status", label: "Status", width: "w-[180px]" },
    { key: "priority", label: "Priority", width: "w-[120px]" },
    { key: "labels", label: "Labels", width: "w-[200px]" },
    { key: "assignee", label: "Assignee", width: "w-[200px]" },
    { key: "due_date", label: "Due date", width: "w-[140px]" },
    { key: "created_at", label: "Created", width: "w-[140px]" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {headers.map((h) => {
                const sField = SORTABLE[h.key];
                const s = sField ? activeSort(sField) : undefined;
                const sortable = !!sField;
                return (
                  <th
                    key={h.key}
                    className={cn(
                      "border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                      h.width
                    )}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={() => handleHeaderSort(h.key)}
                      className={cn(
                        "flex h-9 w-full items-center gap-1 px-3 text-left transition-colors",
                        sortable && "hover:text-foreground"
                      )}
                    >
                      <span>{h.label}</span>
                      {s && (
                        <span className="text-foreground">
                          {s.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {flatCards.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <SearchX className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="text-[14px] font-medium text-foreground">
                        {viewActive ? "No cards match your filters" : "No cards yet"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {viewActive
                          ? "Try adjusting or clearing active filters."
                          : "Create a card on the Board view to get started."}
                      </p>
                    </div>
                    {viewActive && (
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
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              flatCards.map((card) => {
                const overdue =
                  card.due_date &&
                  isPast(new Date(card.due_date)) &&
                  !isToday(new Date(card.due_date));
                return (
                  <tr
                    key={card.id}
                    onClick={() => {
                      setSelectedCard(card);
                      setDialogOpen(true);
                    }}
                    className="group cursor-pointer border-b border-border transition-colors hover:bg-muted"
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-[13px] font-medium text-foreground">
                        {card.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground"
                        style={
                          card.columnColor
                            ? { backgroundColor: `${card.columnColor}1a` }
                            : undefined
                        }
                      >
                        {card.columnColor && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: card.columnColor }}
                          />
                        )}
                        {card.columnName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          PRIORITY_META[card.priority].bg,
                          PRIORITY_META[card.priority].text
                        )}
                      >
                        {PRIORITY_META[card.priority].label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const cardLabels = (card.card_labels || [])
                          .map((cl) => cl.label)
                          .filter((l): l is NonNullable<typeof l> => !!l);
                        return cardLabels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {cardLabels.slice(0, 3).map((l) => (
                              <span
                                key={l.id}
                                className="inline-flex items-center truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ backgroundColor: `${l.color}1A`, color: l.color }}
                              >
                                {l.name}
                              </span>
                            ))}
                            {cardLabels.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{cardLabels.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      {card.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="bg-[#7CAFC4] text-[9px] font-semibold text-white">
                              {card.assignee.full_name
                                ?.split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase() ||
                                card.assignee.email?.[0]?.toUpperCase() ||
                                "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[12px] text-foreground">
                            {card.assignee.full_name || card.assignee.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {card.due_date ? (
                        <span
                          className={cn(
                            "text-[12px]",
                            overdue ? "text-[#C0392B]" : "text-foreground"
                          )}
                        >
                          {format(new Date(card.due_date), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-muted-foreground">
                        {format(new Date(card.created_at), "MMM d, yyyy")}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
            {flatCards.length > 0 && (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-2 text-[12px] text-muted-foreground"
                >
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground"
                    disabled
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CardDetailDialog
        card={selectedCard}
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
