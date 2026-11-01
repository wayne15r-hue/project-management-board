import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const doubles = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: null } })),
  exchange: vi.fn(async () => ({ error: null as null | { message: string } })),
  send: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: doubles.getUser } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: doubles.exchange } }) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: doubles.send }; } }));
import { updateSession } from "@/lib/supabase/middleware";
import { GET as callback } from "@/app/(auth)/callback/route";
import { sendDueDateReminderEmail } from "@/lib/email";
const reminder = { to: "user@example.test", recipientName: "User", cardTitle: "Work", boardId: "board", priority: "low", dueDate: "2026-11-01T12:00:00Z", urgency: "today" as const };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("RESEND_API_KEY", "dummy"); vi.stubEnv("RESEND_FROM", "Board <mail@verified.example.test>"); });
describe("session routing", () => {
  it("allows the exact callback while signed out", async () => {
    expect((await updateSession(new NextRequest("https://app.test/callback?code=abc"))).status).toBe(200);
  });
  it("does not exempt callback-like private paths", async () => {
    expect((await updateSession(new NextRequest("https://app.test/callback/private"))).status).toBe(307);
  });
  it("returns JSON401 to APIs", async () => {
    const response = await updateSession(new NextRequest("https://app.test/api/boards"));
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
  it("lets only the exact cron endpoint authenticate its bearer without a user session", async () => {
    expect((await updateSession(new NextRequest("https://app.test/api/cron/due-date-reminders"))).status).toBe(200);
    expect(doubles.getUser).not.toHaveBeenCalled();
    expect((await updateSession(new NextRequest("https://app.test/api/cron/other"))).status).toBe(401);
  });
  it("preserves private page destinations without leaking code query parameters", async () => {
    const response = await updateSession(new NextRequest("https://app.test/dashboard/board/b?card=c"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/dashboard/board/b?card=c");
  });
});
describe("callback", () => {
  it.each(["//evil.test", "/\\evil.test", "https://evil.test", "/%5cevil.test"])("rejects unsafe next %s", async (next) => {
    const response = await callback(new Request(`https://app.test/callback?code=ok&next=${encodeURIComponent(next)}`));
    expect(response.headers.get("location")).toBe("https://app.test/dashboard");
  });
  it("sends expired confirmation or recovery codes to a useful login error", async () => {
    doubles.exchange.mockResolvedValueOnce({ error: { message: "Expired link" } });
    const response = await callback(new Request("https://app.test/callback?code=expired&next=%2Fupdate-password"));
    expect(response.headers.get("location")).toBe("https://app.test/login?error=auth");
  });
  it("keeps an internal destination", async () => {
    const response = await callback(new Request("https://app.test/callback?code=ok&next=%2Fdashboard%3Fcard%3Dc"));
    expect(response.headers.get("location")).toBe("https://app.test/dashboard?card=c");
  });
});
describe("email delivery", () => {
  it("rejects structured provider errors", async () => {
    doubles.send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Provider rejected" } });
    await expect(sendDueDateReminderEmail(reminder)).rejects.toThrow("Provider rejected");
  });
  it("rejects network failures", async () => {
    doubles.send.mockRejectedValue(new Error("Network failed"));
    await expect(sendDueDateReminderEmail(reminder)).rejects.toThrow("Network failed");
  });
  it("reports accepted delivery and uses configured sender", async () => {
    doubles.send.mockResolvedValue({ data: { id: "accepted" }, error: null });
    await sendDueDateReminderEmail(reminder);
    expect(doubles.send.mock.calls[0][0].from).toBe("Board <mail@verified.example.test>");
  });
  it("renders reminder dates in the same UTC calendar used by the cron", async () => {
    vi.stubEnv("TZ", "Asia/Kolkata");
    doubles.send.mockResolvedValue({ data: { id: "accepted" }, error: null });
    await sendDueDateReminderEmail({ ...reminder, dueDate: "2026-11-01T23:30:00Z" });
    expect(doubles.send.mock.calls[0][0].html).toContain("Nov 1, 2026");
  });
  it("fails closed when sender is missing", async () => {
    vi.stubEnv("RESEND_FROM", "");
    await expect(sendDueDateReminderEmail(reminder)).rejects.toThrow("RESEND_FROM");
    expect(doubles.send).not.toHaveBeenCalled();
  });
});
