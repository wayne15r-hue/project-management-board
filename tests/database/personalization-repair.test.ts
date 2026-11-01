import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { asUser, board, card, column, database, uid } from "./fixture";

let db: PGlite;
async function applyFollowupMigrations() {
  for (const name of fs.readdirSync("supabase/migrations").sort().filter(name => name > "20261101_board_creation.sql")) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
}
beforeAll(async () => {
  db = await database({ policyOnly: true });
  // Reproduce the live schema: hardening is installed, personalization is absent.
  await db.exec("alter table public.cards drop column cover_color; drop table public.board_favorites");
  await applyFollowupMigrations();
});
afterAll(async () => { await db?.close(); });

it("repairs status moves and cover saves without replacing existing cards", async () => {
  await expect(asUser(db, 1, "select (move_card($1,$2,0,'{}'::jsonb)).id as id", [card, column]))
    .resolves.toMatchObject({ rows: [{ id: card }] });
  await asUser(db, 1, "update public.cards set cover_color='#7CAFC4' where id=$1", [card]);
  await applyFollowupMigrations();
  expect((await asUser(db, 1, "select title,cover_color from public.cards where id=$1", [card])).rows)
    .toEqual([{ title: "Secret title", cover_color: "#7CAFC4" }]);
});

it("keeps favorite writes idempotent, user-private, and protected from client TRUNCATE", async () => {
  for (let i = 0; i < 2; i++) {
    await asUser(db, 1, "insert into public.board_favorites(user_id,board_id) values (auth.uid(),$1) on conflict do nothing", [board]);
  }
  expect((await asUser(db, 1, "select board_id from public.board_favorites")).rows).toEqual([{ board_id: board }]);
  expect((await asUser(db, 2, "select board_id from public.board_favorites")).rows).toEqual([]);
  await expect(asUser(db, 2, "insert into public.board_favorites(user_id,board_id) values ($1,$2)", [uid(1), board])).rejects.toThrow();
  expect((await asUser(db, 2, "delete from public.board_favorites returning board_id")).rows).toEqual([]);
  await expect(asUser(db, 1, "truncate public.board_favorites")).rejects.toThrow();
  await db.exec("set role anon");
  await expect(db.query("select * from public.board_favorites")).rejects.toThrow();
  await db.exec("reset role");
  await asUser(db, 1, "delete from public.board_favorites where board_id=$1", [board]);
});
