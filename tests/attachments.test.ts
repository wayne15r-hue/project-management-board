import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: null as null | { storage_path: string }, storageError: false, deleted: false, filters: [] as string[] }));
vi.mock("@/lib/supabase/storage-setup", () => ({ ensureBucket: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
  from: () => ({
    select: () => { const query = { eq: () => query, maybeSingle: async () => ({ data: state.row, error: null }) }; return query; },
    delete: () => { state.deleted = true; const query = { eq: (key: string) => { state.filters.push(key); return query; }, then: (resolve: (value: unknown) => void) => resolve({ error: null }) }; return query; },
  }),
  storage: { from: () => ({ remove: async () => ({ error: state.storageError ? { message: "failed" } : null }) }) },
}) }));
import { DELETE } from "@/app/api/cards/[cardId]/attachments/route";
const invoke = () => DELETE(new Request("https://app.test", { method: "DELETE", body: JSON.stringify({ id: "attachment" }) }), { params: Promise.resolve({ cardId: "card" }) });
beforeEach(() => { state.row = null; state.storageError = false; state.deleted = false; state.filters = []; });
it("does not delete an attachment that does not belong to the requested card", async () => {
  expect((await invoke()).status).toBe(404);
  expect(state.deleted).toBe(false);
});
it("preserves the metadata row when storage removal fails", async () => {
  state.row = { storage_path: "card/file" }; state.storageError = true;
  expect((await invoke()).status).toBe(502);
  expect(state.deleted).toBe(false);
});
it("scopes successful metadata deletion by both card and attachment", async () => {
  state.row = { storage_path: "card/file" };
  expect((await invoke()).status).toBe(200);
  expect(state.filters).toEqual(["id", "card_id"]);
});
