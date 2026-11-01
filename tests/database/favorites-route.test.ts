import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, board, database, uid } from "./fixture";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { GET, POST } from "@/app/api/boards/favorites/route";
let db: PGlite;
beforeAll(async () => {
  db = await database({ policyOnly: true });
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: uid(1) } } }) },
    from: () => ({
      upsert: async (row: { user_id: string; board_id: string }, options?: { ignoreDuplicates?: boolean }) => {
        try {
          await asUser(db, 1,
            `insert into public.board_favorites(user_id,board_id) values ($1,$2) on conflict(user_id,board_id) ${options?.ignoreDuplicates ? "do nothing" : "do update set user_id=excluded.user_id"}`,
            [row.user_id, row.board_id]);
          return { error: null };
        } catch (error) { return { error }; }
      },
      select: () => ({ eq: async (_key: string, id: string) => ({ data: (await asUser(db, 1, "select board_id from public.board_favorites where user_id=$1", [id])).rows, error: null }) }),
    }),
  });
});
afterAll(async () => { await db?.close(); });
it("saves repeated favorite requests using only the granted insert privileges", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await POST(new Request("http://localhost/api/boards/favorites", { method: "POST", body: JSON.stringify({ boardId: board, favorite: true }) }));
    expect(response.status).toBe(200);
  }
  expect(await (await GET()).json()).toEqual({ boardIds: [board] });
});
