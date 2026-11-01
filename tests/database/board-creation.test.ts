import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { asUser, board, database, uid } from "./fixture";

describe("board creation authorization", () => {
  let db: PGlite;
  let createdId: string;

  beforeAll(async () => { db = await database({ policyOnly: true }); });
  afterAll(async () => { await db?.close(); });

  it("returns a newly inserted board to its owner before it has any team links", async () => {
    const result = await asUser(db, 3,
      "insert into public.boards(name, description, owner_id) values ($1, $2, auth.uid()) returning id, name, description, owner_id",
      ["Helios", "Track Helios Build and Design"]);
    expect(result.rows).toEqual([{
      id: expect.any(String), name: "Helios",
      description: "Track Helios Build and Design", owner_id: uid(3),
    }]);
    createdId = (result.rows[0] as { id: string }).id;
    await asUser(db, 3,
      "insert into public.columns(board_id, name, position) values ($1, 'Backlog', 0), ($1, 'Done', 1)",
      [createdId]);
    await asUser(db, 3, "insert into public.labels(board_id, name) values ($1, 'Bug')", [createdId]);
    expect((await asUser(db, 3, "select name from public.columns where board_id=$1 order by position", [createdId])).rows)
      .toEqual([{ name: "Backlog" }, { name: "Done" }]);
  });

  it("preserves collaborator reads while denying outsiders and forged ownership", async () => {
    expect((await asUser(db, 2, "select id from public.boards where id=$1", [board])).rows).toEqual([{ id: board }]);
    expect((await asUser(db, 3, "select id from public.boards where id=$1", [board])).rows).toEqual([]);
    await expect(asUser(db, 3,
      "insert into public.boards(name, owner_id) values ('Forged', $1) returning id", [uid(1)]))
      .rejects.toThrow(/row-level security/);
  });
});

it("repairs the deployed recursive policy without changing existing boards", async () => {
  const db = await database({ policyOnly: true });
  try {
    await db.exec(`alter policy "Board select" on public.boards using (
      owner_id = auth.uid() or exists (
        select 1 from public.board_teams bt
        join public.team_members tm on tm.team_id = bt.team_id
        where bt.board_id = tm.id and tm.user_id = auth.uid()
      )
    )`);
    await expect(asUser(db, 3, "select id from public.boards"))
      .rejects.toThrow(/infinite recursion/);

    await db.exec(fs.readFileSync("supabase/migrations/20261101_board_creation.sql", "utf8"));
    expect((await asUser(db, 3,
      "insert into public.boards(name, owner_id) values ('Repaired', auth.uid()) returning name")).rows)
      .toEqual([{ name: "Repaired" }]);
    expect((await asUser(db, 2, "select id from public.boards where id=$1", [board])).rows)
      .toEqual([{ id: board }]);
    expect((await asUser(db, 3, "select id from public.boards where id=$1", [board])).rows)
      .toEqual([]);
    expect((await db.query("select name from public.boards where id=$1", [board])).rows)
      .toEqual([{ name: "Private board" }]);
  } finally { await db.close(); }
});
