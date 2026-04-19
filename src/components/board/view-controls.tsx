"use client";

import { useEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  useBoardStore,
  type FilterField,
  type FilterOp,
  type SortField,
  type SortDir,
  type ViewFilter,
  type ViewSort,
} from "@/stores/board-store";
import {
  Filter,
  ArrowUpDown,
  Search,
  X,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoardWithDetails, Label, Profile } from "@/types";

interface ViewControlsProps {
  board: BoardWithDetails;
  members: Profile[];
}

const FIELD_LABELS: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  assignee: "Assignee",
  due_date: "Due date",
  label: "Label",
};

const OPS_BY_FIELD: Record<FilterField, { value: FilterOp; label: string }[]> = {
  status: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  priority: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  assignee: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  due_date: [
    { value: "before", label: "before" },
    { value: "after", label: "after" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  label: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};

const SORT_FIELD_LABELS: Record<SortField, string> = {
  title: "Title",
  priority: "Priority",
  due_date: "Due date",
  created_at: "Created",
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function ViewControls({ board, members }: ViewControlsProps) {
  const {
    search,
    setSearch,
    filters,
    addFilter,
    updateFilter,
    removeFilter,
    clearFilters,
    sorts,
    addSort,
    updateSort,
    removeSort,
    clearSorts,
  } = useBoardStore();

  const [labels, setLabels] = useState<Label[]>([]);
  const labelsFetched = useRef(false);

  useEffect(() => {
    if (labelsFetched.current) return;
    labelsFetched.current = true;
    fetch(`/api/boards/${board.id}/labels`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLabels(data); })
      .catch(() => {});
  }, [board.id]);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasActive = filters.length > 0 || sorts.length > 0 || search.trim().length > 0;

  function handleAddFilter() {
    addFilter({ id: newId(), field: "status", op: "is", value: board.columns[0]?.id ?? null });
  }

  function handleAddSort() {
    addSort({ id: newId(), field: "created_at", dir: "desc" });
  }

  function renderValueInput(f: ViewFilter) {
    if (f.op === "is_empty" || f.op === "is_not_empty") return null;

    if (f.field === "status") {
      return (
        <Select
          value={f.value ?? ""}
          onValueChange={(v) => updateFilter(f.id, { value: v })}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 text-[12px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {board.columns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (f.field === "priority") {
      return (
        <Select
          value={f.value ?? ""}
          onValueChange={(v) => updateFilter(f.id, { value: v })}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 text-[12px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (f.field === "assignee") {
      return (
        <Select
          value={f.value ?? ""}
          onValueChange={(v) => updateFilter(f.id, { value: v })}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 text-[12px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (f.field === "due_date") {
      return (
        <Input
          type="date"
          value={f.value ?? ""}
          onChange={(e) => updateFilter(f.id, { value: e.target.value })}
          className="h-7 flex-1 text-[12px]"
        />
      );
    }

    if (f.field === "label") {
      return (
        <Select
          value={f.value ?? ""}
          onValueChange={(v) => updateFilter(f.id, { value: v })}
        >
          <SelectTrigger size="sm" className="h-7 flex-1 text-[12px]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {labels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  {l.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return null;
  }

  function filterPillLabel(f: ViewFilter): string {
    const field = FIELD_LABELS[f.field];
    const op = OPS_BY_FIELD[f.field].find((o) => o.value === f.op)?.label ?? f.op;
    if (f.op === "is_empty" || f.op === "is_not_empty") return `${field} ${op}`;

    let value = f.value ?? "…";
    if (f.field === "status") {
      value = board.columns.find((c) => c.id === f.value)?.name ?? "…";
    } else if (f.field === "assignee") {
      const m = members.find((x) => x.id === f.value);
      value = m?.full_name || m?.email || "…";
    } else if (f.field === "priority") {
      value = value.charAt(0).toUpperCase() + value.slice(1);
    } else if (f.field === "label") {
      value = labels.find((l) => l.id === f.value)?.name ?? "…";
    }
    return `${field} ${op} ${value}`;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Controls row: search + filter + sort */}
      <div className="flex items-center gap-1.5 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-48 rounded-md border border-transparent bg-transparent pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground hover:bg-accent/50 focus:border-foreground/20 focus:bg-background"
          />
          <kbd className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1 text-[9px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        {/* Filter popover */}
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors",
              filters.length > 0
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {filters.length > 0 && (
              <span className="ml-0.5 rounded-sm bg-foreground/10 px-1 text-[10px] font-semibold">
                {filters.length}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filters
            </div>
            {filters.length === 0 && (
              <p className="py-1 text-[12px] text-muted-foreground">
                No filters applied.
              </p>
            )}
            {filters.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5">
                <Select
                  value={f.field}
                  onValueChange={(v) => {
                    const field = v as FilterField;
                    const firstOp = OPS_BY_FIELD[field][0].value;
                    updateFilter(f.id, { field, op: firstOp, value: null });
                  }}
                >
                  <SelectTrigger size="sm" className="h-7 w-28 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_LABELS) as FilterField[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {FIELD_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={f.op}
                  onValueChange={(v) =>
                    updateFilter(f.id, { op: v as FilterOp })
                  }
                >
                  <SelectTrigger size="sm" className="h-7 w-24 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPS_BY_FIELD[f.field].map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {renderValueInput(f)}
                <button
                  type="button"
                  onClick={() => removeFilter(f.id)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Remove filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={handleAddFilter}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add filter
              </button>
              {filters.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-md px-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort popover */}
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors",
              sorts.length > 0
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Sort
            {sorts.length > 0 && (
              <span className="ml-0.5 rounded-sm bg-foreground/10 px-1 text-[10px] font-semibold">
                {sorts.length}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sort by
            </div>
            {sorts.length === 0 && (
              <p className="py-1 text-[12px] text-muted-foreground">
                No sorts applied.
              </p>
            )}
            {sorts.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <Select
                  value={s.field}
                  onValueChange={(v) =>
                    updateSort(s.id, { field: v as SortField })
                  }
                >
                  <SelectTrigger size="sm" className="h-7 flex-1 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_FIELD_LABELS) as SortField[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {SORT_FIELD_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={s.dir}
                  onValueChange={(v) =>
                    updateSort(s.id, { dir: v as SortDir })
                  }
                >
                  <SelectTrigger size="sm" className="h-7 w-24 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => removeSort(s.id)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Remove sort"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={handleAddSort}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add sort
              </button>
              {sorts.length > 0 && (
                <button
                  type="button"
                  onClick={clearSorts}
                  className="rounded-md px-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active pills */}
      {hasActive && (filters.length > 0 || sorts.length > 0) && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5 pb-2">
          {filters.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              {filterPillLabel(f)}
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Remove filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {sorts.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              {s.dir === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
              {SORT_FIELD_LABELS[s.field]}
              <button
                type="button"
                onClick={() => removeSort(s.id)}
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Remove sort"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {(filters.length > 0 || sorts.length > 0) && (
            <button
              type="button"
              onClick={() => {
                clearFilters();
                clearSorts();
              }}
              className="ml-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
