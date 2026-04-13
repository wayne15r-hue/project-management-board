"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { BoardWithDetails, Card, Profile, Priority } from "@/types";
import { CardDetailDialog } from "@/components/board/card-detail-dialog";

interface TableViewProps {
  board: BoardWithDetails;
  members: Profile[];
  onRefresh: () => void;
}

type FlatCard = Card & { columnName: string; columnColor: string | null };

export function TableView({ board, members, onRefresh }: TableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const columns: ColumnDef<FlatCard>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Title
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("title")}</span>
        ),
      },
      {
        accessorKey: "columnName",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-normal">
            {row.original.columnColor && (
              <span
                className="mr-1.5 h-2 w-2 rounded-full inline-block"
                style={{ backgroundColor: row.original.columnColor }}
              />
            )}
            {row.getValue("columnName")}
          </Badge>
        ),
        filterFn: "equals",
      },
      {
        accessorKey: "priority",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Priority
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <PriorityBadge priority={row.getValue("priority") as Priority} />
        ),
        filterFn: "equals",
      },
      {
        accessorKey: "assignee",
        header: "Assignee",
        cell: ({ row }) => {
          const assignee = row.original.assignee;
          if (!assignee) return <span className="text-muted-foreground text-sm">Unassigned</span>;
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  {assignee.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {assignee.full_name || assignee.email}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "due_date",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Due Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const date = row.getValue("due_date") as string | null;
          if (!date) return <span className="text-muted-foreground text-sm">No date</span>;
          return (
            <span className="text-sm">
              {format(new Date(date), "MMM d, yyyy")}
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {format(new Date(row.getValue("created_at")), "MMM d, yyyy")}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: flatCards,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, columnFilters, globalFilter },
  });

  async function handleUpdateCard(cardId: string, data: Partial<Card>) {
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update card");
    onRefresh();
  }

  async function handleDeleteCard(cardId: string) {
    const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete card");
    onRefresh();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Filters */}
      <div className="flex items-center gap-4 px-6 py-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cards..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={(table.getColumn("columnName")?.getFilterValue() as string) ?? "all"}
          onValueChange={(value) =>
            table
              .getColumn("columnName")
              ?.setFilterValue(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {board.columns.map((col) => (
              <SelectItem key={col.id} value={col.name}>
                {col.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={(table.getColumn("priority")?.getFilterValue() as string) ?? "all"}
          onValueChange={(value) =>
            table
              .getColumn("priority")
              ?.setFilterValue(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedCard(row.original);
                    setDialogOpen(true);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No cards found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
