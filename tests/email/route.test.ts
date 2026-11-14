import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/email/route";

const { rpc, getUser, download } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc, storage: { from: () => ({ download }) } }),
}));

const id = "d0000000-d000-4000-8000-000000000001";
const url = "https://helios.example/api/email";
const viewer = { "x-helios-email-user": id };
beforeEach(() => {
  rpc.mockReset();
  download.mockReset();
  getUser.mockReset().mockResolvedValue({ data: { user: { id } } });
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
});

it("denies the mailbox before touching mail data when the pilot is off", async () => {
  rpc.mockResolvedValue({ data: false });
  const response = await GET(new Request(url + "?view=count", { headers: viewer }));
  expect(response.status).toBe(403);
  expect(rpc.mock.calls).toEqual([["email_enabled"]]);
});

it("returns a conflict for a stale draft send so the client can keep its edits", async () => {
  rpc.mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code: "40001", message: "This draft changed elsewhere." } });
  const response = await POST(new Request(url, {
    method: "POST", headers: { ...viewer, "content-type": "application/json", origin: "https://helios.example" },
    body: JSON.stringify({ action: "send", id, version: 1 }),
  }));
  expect(response.status).toBe(409);
  expect(rpc).toHaveBeenLastCalledWith("email_send", { p_id: id, p_version: 1 });
});

it("checks authorization again when redeeming an attachment URL", async () => {
  rpc.mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ data: { path: id, name: "report.pdf", mime: "application/pdf" } })
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code: "P0404", message: "Attachment not found." } });
  const link = await GET(new Request(url + "?view=attachment-link&id=" + id, { headers: viewer }));
  expect(link.status).toBe(200);
  const { href } = await link.json();
  const response = await GET(new Request(new URL(href, url)));
  expect(response.status).toBe(404);
  expect(download).not.toHaveBeenCalled();
});

it("serves an authorized attachment with download and no-sniff headers", async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === "email_enabled"
    ? true : { path: id, name: "report.pdf", mime: "application/pdf" } }));
  download.mockResolvedValue({ data: new Blob(["%PDF-1.7"]) });
  const link = await GET(new Request(url + "?view=attachment-link&id=" + id, { headers: viewer }));
  const { href } = await link.json();
  const response = await GET(new Request(new URL(href, url)));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("rejects a file whose contents do not match its extension before reserving quota", async () => {
  rpc.mockResolvedValue({ data: true });
  const response = await POST(new Request(url + "?upload=" + id + "&version=1", {
    method: "POST", headers: { ...viewer, "x-email-filename": "renamed.pdf", origin: "https://helios.example" },
    body: "<svg></svg>",
  }));
  expect(response.status).toBe(415);
  expect(rpc.mock.calls).toEqual([["email_enabled"]]);
});

it("rejects an outgoing account's delayed autosave before it becomes the new account's draft", async () => {
  rpc.mockResolvedValue({ data: true });
  const response = await POST(new Request(url, {
    method: "POST", headers: {
      "content-type": "application/json", origin: "https://helios.example",
      "x-helios-email-user": "d0000000-d000-4000-8000-000000000002",
    },
    body: JSON.stringify({ action: "save-draft", id, version: 0, subject: "Private note", body: "Secret", recipients: [] }),
  }));
  expect(response.status).toBe(409);
  expect(rpc.mock.calls).toEqual([]);
});
