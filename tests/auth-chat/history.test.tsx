// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Conversation, Message } from "@/types/chat";
vi.mock("@/lib/supabase/client", () => ({ createClient: () => {
  const query = { select: () => query, eq: async () => ({ data: [] }) };
  const channel = { on: () => channel, subscribe: () => channel, track: async () => undefined, presenceState: () => ({}) };
  return { from: () => query, channel: () => channel, removeChannel: () => undefined };
} }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { MessageThread } from "@/components/chat/message-thread";
const user = { id: "u", full_name: "User", email: "u@example.test", avatar_url: null };
function conversation(id: string): Conversation { return { id, name: id, type: "direct", board_id: null, created_by: "u", created_at: "2026-11-01", updated_at: "2026-11-01", last_message_at: null, members: [user], last_message: null, unread_count: 0, current_user_is_admin: false }; }
function message(id: string, content = id, conversation_id = "a"): Message { return { id, conversation_id, sender_id: "u", content, message_type: "text", file_url: null, file_name: null, file_size: null, file_type: null, reply_to_id: null, edited_at: null, created_at: "2026-11-01T00:00:00Z", sender: user }; }
const props = { currentUser: user, onBack: vi.fn(), onMessageSent: vi.fn(), onDelete: vi.fn() };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; }));
it("loads older history with a unique cursor and preserves the scroll anchor", async () => {
  const page = Array.from({ length: 50 }, (_, i) => message(`00000000-0000-4000-8000-${String(i + 100).padStart(12,"0")}`));
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/read") ? {} : url.includes("before=") ? [message("older", "Older history"), page[0]] : page)));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<MessageThread {...props} conversation={conversation("a")} />);
  await screen.findByText(page[0].content!);
  const scroll = view.container.querySelector(".overflow-y-auto")!;
  Object.defineProperties(scroll, { scrollHeight: { configurable: true, get: () => screen.queryByText("Older history") ? 1400 : 1000 }, clientHeight: { value: 400 } });
  scroll.scrollTop = 200;
  fireEvent.scroll(scroll);
  fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
  await screen.findByText("Older history");
  expect(screen.getAllByText(page[0].content!)).toHaveLength(1);
  expect(scroll.scrollTop).toBe(600);
  expect(fetcher.mock.calls.some(([url]) => url.includes("before_id=00000000-0000-4000-8000-000000000100"))).toBe(true);
});
it("ignores a previous conversation's late history response", async () => {
  let resolveOld!: (value: Response) => void;
  const old = new Promise<Response>((resolve) => { resolveOld = resolve; });
  vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/read") ? Promise.resolve(new Response("{}")) : url.includes("/a/") ? old : Promise.resolve(new Response(JSON.stringify([message("b", "Current conversation", "b")])))));
  const view = render(<MessageThread {...props} conversation={conversation("a")} />);
  view.rerender(<MessageThread {...props} conversation={conversation("b")} />);
  await screen.findByText("Current conversation");
  await act(async () => resolveOld(new Response(JSON.stringify([message("late", "Stale conversation")]))));
  await waitFor(() => expect(screen.queryByText("Stale conversation")).toBeNull());
  expect(screen.getByText("Current conversation")).toBeTruthy();
});
