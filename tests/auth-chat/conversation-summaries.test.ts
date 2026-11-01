import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ client: {} as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
import { GET } from "@/app/api/conversations/route";
it("uses per-conversation database summaries for previews and counts above row caps", async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    rpc: vi.fn(async () => ({ data: [{ conversation_id: "quiet", last_message: { content: "Older preview", message_type: "text", created_at: "2026-01-01", sender_id: "s" }, unread_count: 1234 }], error: null })),
    from: (table: string) => {
      const data = table === "conversations" ? [{ id: "quiet", name: "Quiet" }] : table === "conversation_members" ? [{ conversation_id: "quiet", user_id: "u", last_read_at: null, is_admin: false }] : [];
      const query = new Proxy({}, { get: (_t, name) => name === "then" ? (resolve: (value: unknown) => void) => resolve({ data, error: null }) : () => query }); return query;
    },
  };
  state.client = client;
  const response = await GET();
  expect((await response.json())[0]).toMatchObject({ id: "quiet", unread_count: 1234, last_message: { content: "Older preview" } });
  expect(client.rpc).toHaveBeenCalledWith("conversation_summaries");
});
