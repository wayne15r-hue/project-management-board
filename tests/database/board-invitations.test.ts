import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { asUser, board, card, column, database, uid } from "./fixture";

let db: PGlite;
beforeAll(async () => { db = await database({ policyOnly: true }); });
afterAll(async () => { await db?.close(); });

async function invite(email: string) {
  const result = await asUser(db, 1, "select board_invite_send($1,$2) as id", [board, email]);
  return (result.rows[0] as { id: string }).id;
}

it("requires acceptance for dashboard and task access, and waits for every pending invite before assigning", async () => {
  // Make this a private board and leave the existing team fixture intact for other tests.
  await db.query("delete from board_teams where board_id=$1", [board]);
  await expect(asUser(db, 1, "update cards set assignee_id=$1 where id=$2", [uid(2), card]))
    .rejects.toThrow(/board member/i);

  const first = await invite("OTHER@example.test");
  const second = await invite("outsider@example.test");
  expect(await invite("other@example.test")).toBe(first);
  expect((await asUser(db, 2, "select id from boards where id=$1", [board])).rows).toEqual([]);
  expect((await asUser(db, 2, "select id from cards where board_id=$1", [board])).rows).toEqual([]);
  await expect(asUser(db, 2, "select board_share_context($1)", [board])).rejects.toThrow(/board access required/i);
  expect((await asUser(db, 2, "select * from board_invite_inbox()")).rows)
    .toEqual([expect.objectContaining({ id: first, board_id: board, board_name: "Private board" })]);
  await expect(asUser(db, 3, "select board_invite_respond($1,true)", [first])).rejects.toThrow(/invitation/i);
  await expect(asUser(db, 2, "update account_private.board_invitations set status='accepted'")).rejects.toThrow(/permission denied/i);

  await asUser(db, 2, "select board_invite_respond($1,true)", [first]);
  await asUser(db, 2, "select board_invite_respond($1,true)", [first]);
  expect((await asUser(db, 2, "select id from boards where id=$1", [board])).rows).toEqual([{ id: board }]);
  expect((await asUser(db, 2, "select id from cards where board_id=$1", [board])).rows).toEqual([{ id: card }]);
  await asUser(db, 2, "insert into subtasks(card_id,title) values($1,'Collaborator subtask')", [card]);
  const sharing = await asUser(db, 2, "select board_share_context($1) as sharing", [board]);
  expect(sharing.rows).toEqual([{ sharing: expect.objectContaining({
    canInvite: false, pendingCount: 1, pendingInvitations: [],
    members: expect.arrayContaining([expect.objectContaining({ id: uid(2) })]),
  }) }]);
  await expect(asUser(db, 2, "select board_invite_send($1,$2)", [board, "outsider@example.test"]))
    .rejects.toThrow(/owner/i);
  await expect(asUser(db, 2, "update cards set assignee_id=$1 where id=$2", [uid(2), card]))
    .rejects.toThrow(/pending board invitations/i);
  await expect(asUser(db, 1, "insert into cards(board_id,column_id,title,position,created_by,assignee_id) values($1,$2,'Blocked assignment',0,auth.uid(),auth.uid())", [board, column]))
    .rejects.toThrow(/pending board invitations/i);
  await expect(asUser(db, 1, "select move_card($1,$2,0,$3)", [card, column, { assignee_id: uid(2) }]))
    .rejects.toThrow(/pending board invitations/i);
  await asUser(db, 2, "update cards set title='Still editable' where id=$1", [card]);

  await asUser(db, 3, "select board_invite_respond($1,true)", [second]);
  await db.exec("update workflow_runtime set producers_enabled=true");
  await asUser(db, 2, "update cards set assignee_id=$1 where id=$2", [uid(3), card]);
  expect((await asUser(db, 3, "select id from cards where assignee_id=auth.uid()")).rows).toEqual([{ id: card }]);
  expect((await asUser(db, 3, "select card_id,type from notifications")).rows)
    .toEqual([{ card_id: card, type: "assignment" }]);
});

it("lets invitees decline and owners cancel so closed invitations stop blocking assignments", async () => {
  const anotherBoard = "10000000-0000-4000-8000-000000000002";
  const result = await asUser(db, 2, "select board_invite_send($1,$2) as id", [anotherBoard, "outsider@example.test"]);
  const first = (result.rows[0] as { id: string }).id;
  await asUser(db, 3, "select board_invite_respond($1,false)", [first]);
  expect((await asUser(db, 3, "select id from boards where id=$1", [anotherBoard])).rows).toEqual([]);

  const next = await asUser(db, 2, "select board_invite_send($1,$2) as id", [anotherBoard, "outsider@example.test"]);
  const second = (next.rows[0] as { id: string }).id;
  expect(second).not.toBe(first);
  await expect(asUser(db, 3, "select board_invite_respond($1,true)", [first])).rejects.toThrow(/invitation/i);
  await expect(asUser(db, 1, "select board_invite_cancel($1,$2)", [anotherBoard, second])).rejects.toThrow(/owner/i);
  await asUser(db, 2, "select board_invite_cancel($1,$2)", [anotherBoard, second]);
  expect((await asUser(db, 3, "select * from board_invite_inbox()")).rows).toEqual([]);
  const later = await asUser(db, 2, "select board_invite_send($1,$2) as id", [anotherBoard, "outsider@example.test"]);
  await db.query("update account_private.accounts set status='deactivated' where id=$1", [uid(3)]);
  await db.query("update account_private.accounts set status='active' where id=$1", [uid(3)]);
  await expect(asUser(db, 3, "select board_invite_respond($1,true)", [(later.rows[0] as { id: string }).id]))
    .rejects.toThrow(/no longer pending/i);
  const otherColumn = "20000000-0000-4000-8000-000000000002";
  await asUser(db, 2, "insert into cards(board_id,column_id,title,position,created_by,assignee_id) values($1,$2,'Allowed',0,auth.uid(),auth.uid())", [anotherBoard, otherColumn]);
});

it("retains legacy assignments and makes them visible in My Work after the assignee accepts", async () => {
  const migration = "20261112_board_invitations.sql";
  const legacy = await database({ policyOnly: true, beforeMigration: migration });
  try {
    await legacy.query("delete from board_teams where board_id=$1", [board]);
    await asUser(legacy, 1, "update cards set assignee_id=$1 where id=$2", [uid(2), card]);
    await legacy.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    expect((await asUser(legacy, 1, "select assignee_id from cards where id=$1", [card])).rows)
      .toEqual([{ assignee_id: uid(2) }]);
    expect((await asUser(legacy, 2, "select id from boards where id=$1", [board])).rows).toEqual([]);
    await asUser(legacy, 1, "update cards set title='Edited legacy task' where id=$1", [card]);
    const invitation = await asUser(legacy, 1, "select board_invite_send($1,$2) as id", [board, "other@example.test"]);
    await asUser(legacy, 2, "select board_invite_respond($1,true)", [(invitation.rows[0] as { id: string }).id]);
    await legacy.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    expect((await asUser(legacy, 2, "select my_work('mine',null,'','UTC',1)->'items'->0->>'id' as id")).rows)
      .toEqual([{ id: card }]);
  } finally {
    await legacy.close();
  }
});
