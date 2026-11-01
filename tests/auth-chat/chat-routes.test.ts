import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ client: {} as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
import { GET, POST as sendMessage } from "@/app/api/conversations/[conversationId]/messages/route";
import { POST as upload } from "@/app/api/conversations/[conversationId]/upload/route";
const context = { params: Promise.resolve({ conversationId: "conv" }) };
it('pages reconnect recovery forward using timestamp and UUID together',async()=>{
  const f=fixture();
  const response=await GET(new Request('https://app.test/api/messages?after=2026-11-01T00:00:00Z&after_id=00000000-0000-4000-8000-000000000001'),context);
  expect(response.status).toBe(200);
  expect(f.operations).toContainEqual(['order',['created_at',{ascending:true}]]);
  expect(f.operations).toContainEqual(['or',['created_at.gt.2026-11-01T00:00:00Z,and(created_at.eq.2026-11-01T00:00:00Z,id.gt.00000000-0000-4000-8000-000000000001)']]);
});
it('rejects ambiguous reconnect pagination before querying messages',async()=>{
  fixture();
  const response=await GET(new Request('https://app.test/api/messages?after=2026-11-01T00:00:00Z&before=2026-11-01T00:01:00Z'),context);
  expect(response.status).toBe(400);
});
function fixture(member = true) {
  const operations: Array<[string, unknown[]]> = [];
  const writes: Array<Record<string, unknown>> = [];
  const old = { id: "00000000-0000-4000-8000-000000000002", conversation_id: "conv", created_at: "2026-11-01T00:00:00Z", file_url: "https://own.supabase.co/storage/v1/object/sign/chat-files/conv/old.pdf?token=expired" };
  const from = vi.fn((table: string) => {
    const query = new Proxy({}, { get: (_target, name) => {
      if (name === "then") return (resolve: (value: unknown) => void) => resolve({ data: table === "messages" ? [old] : [], error: null });
      if (name === "single") return async () => ({ data: { ...old, ...writes.at(-1) }, error: null });
      return (...args: unknown[]) => { operations.push([String(name), args]); if (name === "insert") writes.push(args[0] as Record<string, unknown>); return query; };
    } }); return query;
  });
  const sign = vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}?fresh` }, error: null }));
  const client = { auth: { getUser: async () => ({ data: { user: { id: "user" } } }) }, rpc: vi.fn(async () => ({ data: member, error: null })), from, storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: sign, remove: async () => ({ error: null }) }) } };
  state.client = client; return { operations, writes, sign, client };
}
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://own.supabase.co"));
describe("chat routes", () => {
  it("refuses nonmember reads before signing any file", async () => {
    const f = fixture(false);
    const response = await GET(new Request("https://app.test/api/messages"), context);
    expect(response.status).toBe(403); expect(f.sign).not.toHaveBeenCalled();
  });
  it("refreshes old expired links for current members", async () => {
    fixture(); const response = await GET(new Request("https://app.test/api/messages"), context);
    expect((await response.json())[0].file_url).toBe("https://signed.test/conv/old.pdf?fresh");
  });
  it("uses a timestamp and UUID cursor so equal-timestamp messages are not skipped", async () => {
    const f = fixture();
    const response = await GET(new Request("https://app.test/api/messages?before=2026-11-01T00%3A00%3A00Z&before_id=00000000-0000-4000-8000-000000000002"), context);
    expect(response.status).toBe(200);
    expect(f.operations).toContainEqual(["order", ["id", { ascending: false }]]);
    expect(f.operations).toContainEqual(["or", ["created_at.lt.2026-11-01T00:00:00Z,and(created_at.eq.2026-11-01T00:00:00Z,id.lt.00000000-0000-4000-8000-000000000002)"]]);
  });
  it("reads a single realtime message by id through the same member-checked signing boundary", async () => {
    const f = fixture();
    const response = await GET(new Request("https://app.test/api/messages?message_id=00000000-0000-4000-8000-000000000002"), context);
    expect(response.status).toBe(200);
    expect(f.operations).toContainEqual(["eq", ["id", "00000000-0000-4000-8000-000000000002"]]);
    expect((await response.json())[0].file_url).toBe("https://signed.test/conv/old.pdf?fresh");
  });
  it("rejects query injection and invalid page sizes before querying messages", async () => {
    const f = fixture();
    expect((await GET(new Request("https://app.test/api/messages?limit=NaN"), context)).status).toBe(400);
    expect(f.client.from).not.toHaveBeenCalled();
  });
  it("persists a stable path after uploading and returns a usable signed URL", async () => {
    const f = fixture(); const form = new FormData(); form.append("file", new File(["hello"], "document.pdf", { type: "application/pdf" }));
    const response = await upload(new NextRequest("https://app.test/api/upload", { method: "POST", body: form }), context);
    expect(response.status).toBe(201);
    expect(f.writes[0].file_url).toMatch(/^conv\/[^?]+\.pdf$/);
    expect((await response.json()).file_url).toMatch(/^https:\/\/signed\.test\//);
  });
  it("refuses externally supplied attachment links on the text endpoint", async () => {
    const f = fixture();
    const response = await sendMessage(new Request("https://app.test/api/messages", { method: "POST", body: JSON.stringify({ message_type: "file", file_url: "https://evil.test/file" }) }), context);
    expect(response.status).toBe(400); expect(f.writes).toHaveLength(0);
  });
});
