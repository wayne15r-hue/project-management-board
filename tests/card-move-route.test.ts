import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ failure: false, reads: 0, moves: [] as unknown[], writes: [] as unknown[] }));
const oldColumn = "20000000-0000-4000-8000-000000000001";
const newColumn = "20000000-0000-4000-8000-000000000002";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
  rpc: async (name: string, args: unknown) => { state.moves.push({ name, args }); return { data: {}, error: state.failure ? { code: "22023", message: "Invalid destination" } : null }; },
  from: (table: string) => {
    const q = { select: () => q, update: (data: unknown) => { state.writes.push(data); return q; }, eq: () => q, single: async () => {
      if (table === "columns") return { data: { name: "In Progress" }, error: null };
      state.reads++;
      return { data: { id: "card", board_id: "board", column_id: state.reads === 1 ? oldColumn : newColumn, position: 1, title: "Task", recurrence_rule: null, assignee: null }, error: null };
    } }; return q;
  },
}) }));
vi.mock("@/lib/activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/notifications", () => ({ createNotification: async () => {} }));
import { PATCH } from "@/app/api/cards/[cardId]/route";
const invoke = () => PATCH(new Request("https://app.test", { method: "PATCH", body: JSON.stringify({ column_id: newColumn, position: 1 }) }), { params: Promise.resolve({ cardId: "card" }) });
beforeEach(() => { state.failure = false; state.reads = 0; state.moves = []; state.writes = []; });
it("persists moves with the database transaction and does not directly overwrite ordering", async () => {
  expect((await invoke()).status).toBe(200);
  expect(state.moves).toEqual([{ name: "move_card", args: { p_card_id: "card", p_column_id: newColumn, p_position: 1, p_updates: {} } }]);
  expect(state.writes).toEqual([]);
});
it("sends metadata with the move transaction rather than a second write", async () => {
  const response = await PATCH(new Request("https://app.test", { method: "PATCH", body: JSON.stringify({ column_id: newColumn, position: 1, title: "Edited" }) }), { params: Promise.resolve({ cardId: "card" }) });
  expect(response.status).toBe(200);
  expect(state.moves).toMatchObject([{ args: { p_updates: { title: "Edited" } } }]);
  expect(state.writes).toEqual([]);
});
it("rejects invalid dates before any move or metadata write", async () => {
  const response = await PATCH(new Request("https://app.test", { method: "PATCH", body: JSON.stringify({ column_id: newColumn, due_date: "not-a-date" }) }), { params: Promise.resolve({ cardId: "card" }) });
  expect(response.status).toBe(400);
  expect(state.moves).toEqual([]);
  expect(state.writes).toEqual([]);
});
it("returns failed transaction errors without a later direct card update", async () => {
  state.failure = true;
  expect((await invoke()).status).toBe(400);
  expect(state.writes).toEqual([]);
});
it("rejects empty block reasons before reads and sends valid block metadata atomically", async () => {
  for (const blocked_reason of [undefined, "   ", "x".repeat(501)]) {
    const response = await PATCH(new Request("https://app.test", { method: "PATCH", body: JSON.stringify({ is_blocked: true, blocked_reason }) }), { params: Promise.resolve({ cardId: "card" }) });
    expect(response.status).toBe(400);
  }
  expect(state.reads).toBe(0);
  const response = await PATCH(new Request("https://app.test", { method: "PATCH", body: JSON.stringify({ column_id: newColumn, is_blocked: true, blocked_reason: "  Waiting  " }) }), { params: Promise.resolve({ cardId: "card" }) });
  expect(response.status).toBe(200);
  expect(state.moves).toMatchObject([{ args: { p_updates: { is_blocked: true, blocked_reason: "Waiting" } } }]);
  expect(state.writes).toEqual([]);
});
