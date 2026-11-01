import { describe, expect, it } from "vitest";
import { chatObjectPath, parseMessageCursor, messagePageLimit } from "@/app/api/conversations/chat-files";
describe("chat attachment identity", () => {
  it("refreshes an expired own-project signed URL into a stable object path", () => {
    expect(chatObjectPath("https://own.supabase.co/storage/v1/object/sign/chat-files/conv/old.pdf?token=expired", "conv", "https://own.supabase.co")).toBe("conv/old.pdf");
    expect(chatObjectPath("conv/new.png", "conv", "https://own.supabase.co")).toBe("conv/new.png");
  });
  it.each([
    "https://evil.test/storage/v1/object/sign/chat-files/conv/a.pdf?token=x",
    "https://own.supabase.co/storage/v1/object/sign/attachments/conv/a.pdf?token=x",
    "https://own.supabase.co/storage/v1/object/sign/chat-files/other/a.pdf?token=x",
    "conv/../other/a.pdf", "conv/%2e%2e/a.pdf", "conv/a\\b.pdf",
  ])("refuses an external or cross-conversation identifier %s", (value) => {
    expect(chatObjectPath(value, "conv", "https://own.supabase.co")).toBeNull();
  });
});
describe("stable message pagination", () => {
  it("keeps the timestamp and UUID tie-breaker", () => {
    expect(parseMessageCursor("2026-11-01T00:00:00.000Z", "00000000-0000-4000-8000-000000000002")).toEqual({ before: "2026-11-01T00:00:00.000Z", beforeId: "00000000-0000-4000-8000-000000000002" });
  });
  it.each([["not-a-date", "bad"], ["2026-11-01", "1),sender_id.eq.other"]])("rejects malformed cursors", (before, id) => {
    expect(() => parseMessageCursor(before, id)).toThrow();
  });
  it.each(["-1", "0", "NaN", "1.2"])("rejects invalid page limit %s", (value) => {
    expect(() => messagePageLimit(value)).toThrow();
  });
  it("caps valid limits and defaults missing limits", () => {
    expect(messagePageLimit("999")).toBe(100); expect(messagePageLimit(null)).toBe(50);
  });
});
