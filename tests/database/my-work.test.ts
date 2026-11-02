import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { asUser, board, card, column, database, uid } from "./fixture";
let db: PGlite;
beforeAll(async () => { db = await database({policyOnly:true}); });
afterAll(async () => { await db?.close(); });
async function work(user=1, tab="mine", search="", page=1, timezone="UTC", boardId:string|null=null) {
  const result = await asUser(db,user,"select public.my_work($1,$2,$3,$4,$5) as result",[tab,boardId,search,timezone,page]);
  return (result.rows[0] as {result: {items: Array<Record<string,unknown>>; counts: {totalOpen:number;blocked:number;overdue:number;dueToday:number}; total:number; boards:Array<{id:string}>}}).result;
}
it("uses assignment, attention ownership, RLS and single-column completion correctly", async () => {
  await db.query("update cards set assignee_id=$1, due_date=now()-interval '2 days' where id=$2",[uid(2),card]);
  expect((await work()).total).toBe(0);
  expect((await work(1,"attention")).total).toBe(1);
  expect((await work(2)).total).toBe(1);
  expect((await work(3)).counts.totalOpen).toBe(0);
  expect((await work(3)).boards).toEqual([]);
  await db.query("delete from team_members where user_id=$1",[uid(2)]);
  expect((await work(2)).total).toBe(0);
  await db.query("insert into team_members(team_id,user_id,role) values ('70000000-0000-4000-8000-000000000001',$1,'member')",[uid(2)]);
});
it("enforces trimmed block reasons, clears on unblock and records durable activity", async () => {
  await expect(asUser(db,1,"update cards set is_blocked=true, blocked_reason='   ' where id=$1",[card])).rejects.toThrow(/reason/i);
  await asUser(db,1,"update cards set is_blocked=true,blocked_reason='  Waiting  ' where id=$1",[card]);
  expect((await db.query("select blocked_reason from cards where id=$1",[card])).rows).toEqual([{blocked_reason:"Waiting"}]);
  expect((await db.query("select action from activity_log where card_id=$1 and action='blocked'",[card])).rows).toHaveLength(1);
  await asUser(db,1,"update cards set is_blocked=false where id=$1",[card]);
  expect((await db.query("select blocked_reason from cards where id=$1",[card])).rows).toEqual([{blocked_reason:null}]);
});
it("returns full counts and pagination beyond 1000, literal search and stable priority order", async () => {
  await db.query("insert into cards(board_id,column_id,title,position,created_by,assignee_id,priority) select $1,$2,'Batch '||n,n,$3,$3,case when n=1001 then 'high' else 'low' end from generate_series(1,1001) n",[board,column,uid(1)]);
  const first=await work();
  expect(first.total).toBe(1001); expect(first.counts.totalOpen).toBe(1001); expect(first.items).toHaveLength(50);
  expect(first.items[0].title).toBe("Batch 1001");
  expect((await work(1,"mine","",21)).items).toHaveLength(1);
  expect((await work(1,"mine","%" )).total).toBe(0);
  expect((await work(1,"mine","Batch 1001")).counts.totalOpen).toBe(1);
  expect((await work(1,"mine","",1,"UTC","10000000-0000-4000-8000-000000000002")).counts.totalOpen).toBe(0);
  expect((first.items[0].assignee as Record<string,unknown>).anthropic_api_key).toBeUndefined();
});
it("uses local calendar dates at midnight and rejects completed columns deterministically", async () => {
  await db.query("update cards set due_date=date_trunc('day',now())+interval '1 hour' where title='Batch 1001'");
  const today=await work(1,"mine","Batch 1001",1,"UTC");
  expect(today.counts.dueToday).toBe(1);
  const expected = await db.query<{overdue:boolean}>("select (due_date at time zone 'Etc/GMT+12')::date < (now() at time zone 'Etc/GMT+12')::date as overdue from cards where title='Batch 1001'");
  expect((await work(1,"mine","Batch 1001",1,"Etc/GMT+12")).counts.overdue).toBe(expected.rows[0].overdue ? 1 : 0);
  expect((await work(1,"mine","Batch 1001",1,"Invalid/Zone")).counts).toEqual(today.counts);
  await db.query("update cards set due_date=(date_trunc('day',now() at time zone 'Pacific/Kiritimati')-interval '1 second') at time zone 'Pacific/Kiritimati' where title='Batch 1001'");
  expect((await work(1,"mine","Batch 1001",1,"Pacific/Kiritimati")).counts.overdue).toBe(1);
  await db.query("update cards set due_date=date_trunc('day',now() at time zone 'Pacific/Kiritimati') at time zone 'Pacific/Kiritimati' where title='Batch 1001'");
  expect((await work(1,"mine","Batch 1001",1,"Pacific/Kiritimati")).counts.dueToday).toBe(1);
  await db.query("insert into columns(id,board_id,name,position) values ('20000000-0000-4000-8000-000000000003',$1,'Final',1)",[board]);
  await db.query("update cards set column_id='20000000-0000-4000-8000-000000000003' where title='Batch 1001'");
  expect((await work(1,"mine","Batch 1001")).total).toBe(0);
  await db.query("update columns set name=' Completed ' where id=$1",[column]);
  expect((await work()).total).toBe(0);
  await db.query("update columns set name='To Do' where id=$1",[column]);
});
it("rolls back movement and metadata when block validation fails; preserves ordinary fields", async () => {
  await expect(asUser(db,1,"select move_card($1,'20000000-0000-4000-8000-000000000003',0,$2)",[card,JSON.stringify({title:"Lost",is_blocked:true,blocked_reason:""})])).rejects.toThrow(/reason/i);
  expect((await db.query("select title,column_id from cards where id=$1",[card])).rows).toEqual([{title:"Secret title",column_id:column}]);
  await asUser(db,1,"select move_card($1,'20000000-0000-4000-8000-000000000003',0,$2)",[card,JSON.stringify({title:"Changed",is_blocked:true,blocked_reason:"Dependency"})]);
  expect((await db.query("select title,is_blocked,assignee_id from cards where id=$1",[card])).rows).toEqual([{title:"Changed",is_blocked:true,assignee_id:uid(2)}]);
});
it("is repeatable, preserves legacy updates and gives recurring copies unblocked defaults", async () => {
  await db.exec(fs.readFileSync("supabase/migrations/20261102_my_work.sql","utf8"));
  await asUser(db,1,"update cards set title='Legacy edit' where id=$1",[card]);
  expect((await db.query("select is_blocked,blocked_reason from cards where id=$1",[card])).rows).toEqual([{is_blocked:true,blocked_reason:"Dependency"}]);
  const copy=await asUser(db,1,"insert into cards(board_id,column_id,title,position,created_by,recurrence_parent_id,recurrence_rule) values ($1,$2,'Recurring',0,auth.uid(),$3,'daily') returning is_blocked,blocked_reason",[board,column,card]);
  expect(copy.rows).toEqual([{is_blocked:false,blocked_reason:null}]);
  expect((await db.query("select count(*)::integer as n from activity_log where card_id=$1 and action='blocked'",[card])).rows).toEqual([{n:2}]);
});
it("records an initially blocked direct insertion and rejects null/oversized reasons", async () => {
  for (const reason of [null,"\t\n", "x".repeat(501)]) {
    await expect(asUser(db,1,"update cards set is_blocked=true,blocked_reason=$1 where id=$2",[reason,card])).rejects.toThrow(/reason/i);
  }
  const inserted=await asUser(db,1,"insert into cards(board_id,column_id,title,position,created_by,is_blocked,blocked_reason) values ($1,$2,'Blocked at creation',0,auth.uid(),true,'Waiting') returning id",[board,column]);
  const id=(inserted.rows[0] as {id:string}).id;
  expect((await db.query("select actor_id,action from activity_log where card_id=$1",[id])).rows).toEqual([{actor_id:uid(1),action:"blocked"}]);
});
