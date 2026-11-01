import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: false, checkError: false, rows: [] as unknown[], emails: [] as unknown[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: async () => ({ data: state.allowed, error: state.checkError ? { message: "unavailable" } : null }),
  from: (table: string) => table === "notifications" ? { insert: async (row: unknown) => { state.rows.push(row); return { error: null }; } } : {
    select: () => ({ eq: () => ({ single: async () => ({ data: { email: "member@example.test", full_name: "Member", email_notifications: true }, error: null }) }) }),
  },
}) }));
vi.mock("@/lib/email", () => ({
  sendAssignmentNotificationEmail: async (input: unknown) => { state.emails.push(input); },
  sendMentionNotificationEmail: async (input: unknown) => { state.emails.push(input); },
  sendCommentNotificationEmail: async (input: unknown) => { state.emails.push(input); },
}));
import { createNotification } from "@/lib/notifications";

const input = { recipientId: "recipient", actorId: "actor", type: "mention" as const, cardId: "private-card", boardId: "private-board", title: "Private title", body: "Private comment", email: { kind: "mention" as const, cardTitle: "Private title", commentText: "Private comment" } };
describe("private notification boundary", () => {
  beforeEach(() => { state.allowed = false; state.checkError = false; state.rows = []; state.emails = []; });
  it("emits no private data to a recipient without board access", async () => {
    await createNotification(input);
    expect(state.rows).toEqual([]);
    expect(state.emails).toEqual([]);
  });
  it("fails closed when recipient access cannot be checked", async () => {
    state.allowed = true; state.checkError = true;
    await createNotification(input);
    expect(state.rows).toEqual([]);
    expect(state.emails).toEqual([]);
  });
  it("delivers to an authorized board member", async () => {
    state.allowed = true;
    await createNotification(input);
    expect(state.rows).toMatchObject([{ recipient_id: "recipient", card_id: "private-card", title: "Private title" }]);
    expect(state.emails).toMatchObject([{ to: "member@example.test", cardTitle: "Private title" }]);
  });
});
