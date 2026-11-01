import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ reservation: null as string | null, error: null as null | { message: string }, calls: 0, updates: [] as unknown[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }), insert: async () => ({ error: null }) }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: async () => ({ data: state.reservation, error: state.error }),
  from: () => ({ update: (payload: unknown) => ({ eq: async (_key: string, id: string) => { state.updates.push({ id, payload }); return { error: null }; } }) }),
}) }));
vi.mock("groq-sdk", () => ({ default: class {
  chat = { completions: { create: async () => { state.calls++; return { choices: [{ message: { content: "answer" } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }; } } };
} }));
import { askAI } from "@/lib/ai/client";
beforeEach(() => { vi.stubEnv("GROQ_API_KEY", "fake-test-key"); state.reservation = null; state.error = null; state.calls = 0; state.updates = []; });
const ask = () => askAI({ userId: "user", feature: "chat", systemPrompt: "help", userMessage: "question" });
it("rejects exhausted quota before contacting the billed provider", async () => {
  await expect(ask()).rejects.toMatchObject({ code: "daily_limit", status: 429 });
  expect(state.calls).toBe(0);
});
it("fails closed when authoritative quota storage is unavailable", async () => {
  state.error = { message: "unavailable" };
  await expect(ask()).rejects.toMatchObject({ code: "unknown", status: 503 });
  expect(state.calls).toBe(0);
});
it("maps the database daily-limit rejection to HTTP429", async () => {
  state.error = { message: "Daily AI limit reached" };
  await expect(ask()).rejects.toMatchObject({ code: "daily_limit", status: 429 });
  expect(state.calls).toBe(0);
});
it("updates only the reserved usage row after a successful completion", async () => {
  state.reservation = "reserved-row";
  await expect(ask()).resolves.toBe("answer");
  expect(state.updates).toMatchObject([{ id: "reserved-row", payload: { input_tokens: 3, output_tokens: 4 } }]);
});
