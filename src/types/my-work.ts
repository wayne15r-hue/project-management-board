import type { Card } from "@/types";
export interface MyWorkItem extends Card {
  is_blocked: boolean;
  blocked_reason: string | null;
  board: { id: string; name: string; owner_id: string };
  column: { id: string; name: string };
  group: "overdue" | "today" | "upcoming" | "undated";
  is_overdue: boolean;
  is_due_today: boolean;
}
export interface MyWorkResponse {
  items: MyWorkItem[];
  counts: { overdue: number; dueToday: number; blocked: number; totalOpen: number };
  total: number;
  page: number;
  pageSize: number;
  boards: { id: string; name: string }[];
}
