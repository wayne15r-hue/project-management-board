import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ upload: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
  storage: { from: () => ({ upload: state.upload, getPublicUrl: () => ({ data: { publicUrl: "https://app.test/avatar" } }) }) },
  from: () => ({ update: () => ({ eq: state.update }) }),
}) }));
vi.mock("@/lib/supabase/storage-setup", () => ({ ensureBucket: async () => ({ ok: true }) }));
import { POST } from "@/app/api/profile/avatar/route";
async function avatar(size: number, type = "image/png") { const form = new FormData(); form.append("file", new File([new Uint8Array(size)], "photo.png", { type })); return POST(new Request("https://app.test/api/profile/avatar", { method: "POST", body: form })); }
it("accepts an allowed image just below 2MB and rejects above the bucket limit before upload", async () => {
  state.upload.mockResolvedValue({ error: null }); state.update.mockResolvedValue({ error: null });
  expect((await avatar(2 * 1024 * 1024 - 1)).status).toBe(200);
  state.upload.mockClear();
  expect((await avatar(2 * 1024 * 1024 + 1)).status).toBe(400);
  expect(state.upload).not.toHaveBeenCalled();
});
it("rejects image formats not allowed by the avatar bucket", async () => {
  state.upload.mockClear(); expect((await avatar(10, "image/svg+xml")).status).toBe(400); expect(state.upload).not.toHaveBeenCalled();
});
