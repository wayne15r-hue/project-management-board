import { beforeEach, describe, expect, it, vi } from "vitest";
const doubles = vi.hoisted(() => ({ admin: vi.fn(), send: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: doubles.admin }));
vi.mock("@/lib/email", () => ({ sendDueDateReminderEmail: doubles.send }));
import { GET } from "@/app/api/cron/due-date-reminders/route";
function db(cards: object[]) {
  const filters: Array<[string, unknown[]]> = [];
  const chain = new Proxy({}, { get: (_target, key) => key === "then" ? (resolve: (value: object) => void) => resolve({ data: cards, error: null }) : (...args: unknown[]) => { filters.push([String(key), args]); return chain; } });
  doubles.admin.mockReturnValue({ from: () => chain, rpc: doubles.access }); return filters;
}
beforeEach(() => { vi.clearAllMocks(); doubles.access.mockResolvedValue({ data: true, error: null }); vi.stubEnv("CRON_SECRET", "cron-secret"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T00:15:00Z")); });
import { afterEach } from "vitest";
afterEach(() => vi.useRealTimers());
describe("scheduled reminders", () => {
  it("fails closed for a missing secret, even Bearer undefined", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://app.test/api/cron/due-date-reminders", { headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
    expect(doubles.admin).not.toHaveBeenCalled();
  });
  it("rejects an incorrect secret", async () => {
    expect((await GET(new Request("https://app.test/api/cron/due-date-reminders", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });
  it("excludes opted-out users and Done/Completed work and counts only accepted sends", async () => {
    const base = { id: "card", board_id: "board", title: "Work", priority: "low", due_date: "2026-11-01T08:00:00Z", column: { id: "todo", name: "Todo" }, board: { columns: [{ id: "todo", position: 0 }, { id: "last", position: 1 }] }, assignee: { id: "user", email: "u@example.test", full_name: "User", email_notifications: true } };
    db([{ ...base, assignee: { ...base.assignee, email_notifications: false } }, { ...base, column: { name: "Done" } }, { ...base, column: { name: "completed" } }, base]);
    doubles.send.mockRejectedValue(new Error("Provider rejected"));
    const result = await GET(new Request("https://app.test/api/cron/due-date-reminders", { headers: { authorization: "Bearer cron-secret" } }));
    expect(await result.json()).toMatchObject({ sent: 0, failed: 1 });
    expect(doubles.send).toHaveBeenCalledTimes(1);
    expect(doubles.send.mock.calls[0][0]).toMatchObject({ urgency: "today", idempotencyKey: "due-card-user-2026-11-01" });
  });
  it.each([
    ["outsider or former member", { data: false, error: null }],
    ["failed access lookup", { data: null, error: { message: "Access check unavailable" } }],
  ])("never sends private reminders to an %s", async (_case, result) => {
    db([{ id: "card", board_id: "private-board", title: "Private card", priority: "low", due_date: "2026-11-01T08:00:00Z", column: { id: "todo", name: "Todo" }, board: { columns: [{ id: "todo", position: 0 }, { id: "last", position: 1 }] }, assignee: { id: "outsider", email: "outsider@example.test", full_name: "Outsider", email_notifications: true } }]);
    doubles.access.mockResolvedValue(result);
    doubles.send.mockResolvedValue(undefined);
    const response = await GET(new Request("https://app.test/api/cron/due-date-reminders", { headers: { authorization: "Bearer cron-secret" } }));
    expect(await response.json()).toMatchObject({ sent: 0 });
    expect(doubles.send).not.toHaveBeenCalled();
    expect(doubles.access).toHaveBeenCalledWith("notification_recipient_allowed", {
      p_card_id: "card", p_board_id: "private-board", p_actor_id: "outsider", p_recipient_id: "outsider",
    });
  });

  it.each([
    ["renamed terminal column", { id: "shipped", name: "Shipped" }, [{ id: "todo", position: 0 }, { id: "shipped", position: 3 }], 0],
    ["terminal position tie resolved by id", { id: "z-last", name: "Shipped" }, [{ id: "z-last", position: 3 }, { id: "a-first", position: 3 }], 0],
    ["one-column Todo board", { id: "todo", name: "Todo" }, [{ id: "todo", position: 0 }], 1],
    ["missing completion metadata", { id: "todo", name: "Todo" }, null, 0],
  ])("handles %s without emailing completed work", async (_case, column, columns, sent) => {
    db([{ id: "card", board_id: "board", title: "Work", priority: "low", due_date: "2026-11-01T08:00:00Z", column, board: { columns }, assignee: { id: "user", email: "u@example.test", full_name: "User", email_notifications: true } }]);
    doubles.send.mockResolvedValue(undefined);
    const response = await GET(new Request("https://app.test/api/cron/due-date-reminders", { headers: { authorization: "Bearer cron-secret" } }));
    expect(await response.json()).toMatchObject({ sent });
    expect(doubles.send).toHaveBeenCalledTimes(sent);
  });

});
