import type { Card, Column } from "@/types";
import type { ViewFilter, ViewSort } from "@/stores/board-store";

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function matchFilter(card: Card, filter: ViewFilter): boolean {
  switch (filter.field) {
    case "status": {
      if (filter.op === "is") return card.column_id === filter.value;
      if (filter.op === "is_not") return card.column_id !== filter.value;
      return true;
    }
    case "priority": {
      if (filter.op === "is") return card.priority === filter.value;
      if (filter.op === "is_not") return card.priority !== filter.value;
      return true;
    }
    case "assignee": {
      if (filter.op === "is_empty") return card.assignee_id == null;
      if (filter.op === "is_not_empty") return card.assignee_id != null;
      if (filter.op === "is") return card.assignee_id === filter.value;
      if (filter.op === "is_not") return card.assignee_id !== filter.value;
      return true;
    }
    case "due_date": {
      if (filter.op === "is_empty") return card.due_date == null;
      if (filter.op === "is_not_empty") return card.due_date != null;
      if (!card.due_date || !filter.value) return false;
      const d = new Date(card.due_date).getTime();
      const v = new Date(filter.value).getTime();
      if (filter.op === "before") return d < v;
      if (filter.op === "after") return d > v;
      return true;
    }
    default:
      return true;
  }
}

function matchSearch(card: Card, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    card.title.toLowerCase().includes(q) ||
    (card.description ?? "").toLowerCase().includes(q)
  );
}

function compareCards(a: Card, b: Card, sorts: ViewSort[]): number {
  for (const s of sorts) {
    let cmp = 0;
    switch (s.field) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "priority":
        cmp = (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0);
        break;
      case "due_date": {
        const av = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bv = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = av - bv;
        break;
      }
      case "created_at": {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      }
    }
    if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
  }
  return 0;
}

export function applyView(
  cards: Card[],
  filters: ViewFilter[],
  sorts: ViewSort[],
  search: string
): Card[] {
  let result = cards.filter((c) => matchSearch(c, search));
  for (const f of filters) result = result.filter((c) => matchFilter(c, f));
  if (sorts.length) result = [...result].sort((a, b) => compareCards(a, b, sorts));
  return result;
}

export function applyViewToColumns<C extends Column & { cards: Card[] }>(
  columns: C[],
  filters: ViewFilter[],
  sorts: ViewSort[],
  search: string
): C[] {
  return columns.map((col) => ({
    ...col,
    cards: applyView(col.cards, filters, sorts, search),
  }));
}

export function isViewActive(
  filters: ViewFilter[],
  sorts: ViewSort[],
  search: string
): boolean {
  return filters.length > 0 || sorts.length > 0 || search.trim().length > 0;
}
