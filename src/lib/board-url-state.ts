import type { ViewFilter, ViewSort } from "@/stores/board-store";

export interface BoardUrlState { filters: ViewFilter[]; sorts: ViewSort[]; search: string }
const operations: Record<string, string[]> = {
  status: ["is", "is_not"], priority: ["is", "is_not"],
  assignee: ["is", "is_not", "is_empty", "is_not_empty"],
  label: ["is", "is_not", "is_empty", "is_not_empty"],
  due_date: ["before", "after", "is_empty", "is_not_empty"],
};
const boundedString = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
function parseList(raw: string | null): unknown[] {
  if (!raw || raw.length > 8192) return [];
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) && value.length <= 20 ? value : []; } catch { return []; }
}
function validFilter(value: unknown): value is ViewFilter {
  if (!value || typeof value !== "object") return false;
  const f = value as Record<string, unknown>;
  if (!boundedString(f.id) || typeof f.field !== "string" || typeof f.op !== "string" || (!Object.hasOwn(operations, f.field) || !operations[f.field].includes(f.op))) return false;
  if (f.op === "is_empty" || f.op === "is_not_empty") return f.value == null || boundedString(f.value);
  if (!boundedString(f.value)) return false;
  if (f.field === "priority") return ["low", "medium", "high"].includes(f.value);
  if (f.field === "due_date") return Number.isFinite(Date.parse(f.value));
  return true;
}
function validSort(value: unknown): value is ViewSort {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return boundedString(s.id) && ["title", "priority", "due_date", "created_at"].includes(String(s.field)) && (s.dir === "asc" || s.dir === "desc");
}
export function decodeBoardState(params: URLSearchParams): BoardUrlState {
  return { search: (params.get("q") ?? "").slice(0, 500), filters: parseList(params.get("filter")).filter(validFilter), sorts: parseList(params.get("sort")).filter(validSort) };
}
export function encodeBoardState(params: URLSearchParams, state: BoardUrlState): string {
  const result = new URLSearchParams(params);
  for (const key of ["q", "filter", "sort"]) result.delete(key);
  if (state.search.trim()) result.set("q", state.search.slice(0, 500));
  if (state.filters.length) result.set("filter", JSON.stringify(state.filters));
  if (state.sorts.length) result.set("sort", JSON.stringify(state.sorts));
  return result.toString();
}
export function targetCardId(params: URLSearchParams): string | null {
  const value = params.get("card");
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
