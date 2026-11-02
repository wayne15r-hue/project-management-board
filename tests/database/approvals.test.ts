import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { asUser as fixtureAsUser, board, card, column, database, uid } from "./fixture";

async function asUser(...args: Parameters<typeof fixtureAsUser>) {
  return fixtureAsUser(...args) as Promise<{ rows: Record<string, unknown>[] }>;
}

let db: PGlite;
let seq = 100;
const operation = () => `90000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
const done = "20000000-0000-4000-8000-000000000009";
async function transition(user: number, action: string, payload: Record<string, unknown> = {}, id = card) {
  return asUser(db, user, "select transition_card_approval($1,$2,$3::jsonb) as value", [id, action,
    JSON.stringify({ operationId: operation(), expectedRevision: 1, ...payload })]);
}
async function details(user = 1, id = card) {
  const result = await asUser(db, user, "select get_card_approval($1) as value", [id]);
  return result.rows[0].value as Record<string, unknown>;
}
async function configure() { return transition(1, "configure", { required: true, reviewerId: uid(2) }); }
async function request() {
  const result = await transition(1, "request", { reviewDueDate: "2099-01-01" });
  return (result.rows[0].value as { current_request: { id: string } }).current_request.id;
}
describe("approval database authority", () => {
  beforeEach(async () => {
    db = await database();
    await db.query("insert into columns(id,board_id,name,position) values($1,$2,'Done',1)", [done, board]);
  });
  afterEach(async () => { await db.close(); });
  it("restricts configuration, rejects self-review, and protects privileged state", async () => {
    await expect(transition(2, "configure", { required: true, reviewerId: uid(1) })).rejects.toThrow(/owner/i);
    await transition(1, "configure", { required: true, reviewerId: uid(1) });
    await expect(transition(1, "request", { reviewDueDate: "2099-01-01" })).rejects.toThrow(/reviewer/i);
    await transition(1,"configure",{required:true,reviewerId:uid(2)});
    await expect(asUser(db, 1, "update card_approval_settings set approved_revision=revision where card_id=$1", [card])).rejects.toThrow(/permission denied/i);
    expect((await details()).required).toBe(true);
  });
  it("allows owner review of another assignee without permitting requester self-review",async()=>{
    await asUser(db,1,"update cards set assignee_id=$1 where id=$2",[uid(2),card]);
    await transition(1,"configure",{required:true,reviewerId:uid(1)});
    expect(((await details()).eligible_reviewers as {id:string}[]).map(p=>p.id)).toContain(uid(1));
    const result=await transition(2,"request",{reviewDueDate:"2099-01-01"});
    const requestId=(result.rows[0].value as {current_request:{id:string}}).current_request.id;
    await transition(1,"approve",{requestId});
    expect((await details()).status).toBe("approved");
  });
  it("preserves review on unchanged custom-value upserts and invalidates once when content changes",async()=>{
    const field="41000000-0000-4000-8000-000000000001";
    await db.query("insert into custom_field_definitions(id,board_id,name,field_type) values($1,$2,'Review value','text')",[field,board]);
    const save=(value:string)=>asUser(db,1,"insert into custom_field_values(card_id,field_id,value) values($1,$2,to_jsonb($3::text)) on conflict(card_id,field_id) do update set value=excluded.value",[card,field,value]);
    await save("Same");await configure();const requestId=await request();
    await save("Same");expect(await details()).toMatchObject({status:"pending",revision:1});
    await transition(2,"approve",{requestId});await save("Same");
    expect(await details()).toMatchObject({status:"approved",revision:1});
    await asUser(db,1,"update cards set column_id=$1 where id=$2",[done,card]);
    await save("Same");expect(await details()).toMatchObject({status:"approved",revision:1});
    await asUser(db,1,"update cards set column_id=$1 where id=$2",[column,card]);
    const reopened=(await details()).revision;
    await save("Changed");expect((await details()).revision).toBe(Number(reopened)+1);
  });
  it("binds decisions to revision, current reviewer and idempotent operation payload", async () => {
    await configure(); const requestId = await request();
    await expect(transition(1, "approve", { requestId })).rejects.toThrow(/reviewer/i);
    const op = operation();
    const payload = { operationId: op, expectedRevision: 1, requestId };
    await transition(2, "approve", payload);
    await transition(2, "approve", payload);
    expect((await details()).status).toBe("approved");
    const count = await db.query<{n:number}>("select count(*)::int as n from approval_history where action='approved'");
    expect(count.rows[0].n).toBe(1);
    await expect(transition(2, "request_changes", { ...payload, note: "Different" })).rejects.toThrow(/operation|conflict/i);
    await expect(transition(2, "approve", { requestId, expectedRevision: 99 })).rejects.toThrow(/revision/i);
  });
  it("replays approval migration without losing requests, history or operation identities and rolls back an injected failure",async()=>{
    await configure();await request();
    const snapshot=async()=>{
      const result=await db.query("select jsonb_build_object('settings',(select jsonb_agg(to_jsonb(s)) from card_approval_settings s),'requests',(select jsonb_agg(to_jsonb(r)) from approval_requests r),'history',(select jsonb_agg(to_jsonb(h)) from approval_history h),'operations',(select jsonb_agg(to_jsonb(o)) from approval_operations o)) as data");
      return result.rows;
    };
    const before=await snapshot();
    const migration=fs.readFileSync("supabase/migrations/20261102_workflow_02_approvals.sql","utf8");
    await db.exec(migration);await db.exec(migration);
    expect(await snapshot()).toEqual(before);
    await expect(db.exec(migration.replace(/commit;\s*$/i,"alter table cards add column approval_rollback_probe integer; select 1/0; commit;"))).rejects.toThrow(/division by zero/);
    await db.exec("rollback");
    expect((await db.query("select column_name from information_schema.columns where table_name='cards' and column_name='approval_rollback_probe'")).rows).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
  it("gates direct SQL and move RPC completion, invalidates content but retains administrative approval", async () => {
    await configure();
    await expect(asUser(db, 1, "update cards set column_id=$1 where id=$2", [done, card])).rejects.toThrow(/approval/i);
    await expect(asUser(db, 1, "select move_card($1,$2,0)", [card, done])).rejects.toThrow(/approval/i);
    const requestId = await request(); await transition(2, "approve", { requestId });
    await asUser(db, 1, "update cards set priority='high',due_date=now() where id=$1", [card]);
    expect((await details()).status).toBe("approved");
    await asUser(db, 1, "update cards set column_id=$1 where id=$2", [done, card]);
    await expect(asUser(db, 1, "update cards set title='Changed' where id=$1", [card])).rejects.toThrow(/reopen/i);
    await asUser(db, 1, "update cards set column_id=$1 where id=$2", [column, card]);
    expect((await details()).status).toBe("not_requested");
    expect((await details()).revision).toBe(2);
  });
  it("invalidates related content, protects completed related edits and referenced field definitions", async () => {
    await configure(); await request();
    await asUser(db, 1, "insert into subtasks(card_id,title) values($1,'Deliver')", [card]);
    expect((await details()).revision).toBe(2);
    expect((await details()).status).toBe("not_requested");
    const req = await transition(1, "request", { expectedRevision: 2, reviewDueDate: "2099-01-01" });
    const requestId = (req.rows[0].value as {current_request:{id:string}}).current_request.id;
    await transition(2, "approve", { requestId, expectedRevision: 2 });
    await asUser(db, 1, "update cards set column_id=$1 where id=$2", [done, card]);
    await expect(asUser(db, 1, "delete from subtasks where card_id=$1", [card])).rejects.toThrow(/reopen/i);
  });
  it("rejects implicit completion/reopening from atomic and legacy column writes", async () => {
    await configure();
    await expect(asUser(db, 1, "update columns set name='Completed' where id=$1", [column])).rejects.toThrow(/column|explicit/i);
    await expect(asUser(db, 1, "select update_board_columns($1,$2::jsonb)", [board, JSON.stringify([{ id: column, name: "Changed" }, { id: done, position: -1 }])])).rejects.toThrow();
    expect((await db.query<{name:string}>("select name from columns where id=$1", [column])).rows[0].name).toBe("To Do");
  });
  it("rejects column deletion that would implicitly complete even an approved task", async () => {
    await configure(); const requestId=await request(); await transition(2,"approve",{requestId});
    await expect(asUser(db,1,"select delete_board_column($1,$2)",[board,column])).rejects.toThrow(/column|explicit/i);
    expect((await db.query<{column_id:string}>("select column_id from cards where id=$1",[card])).rows[0].column_id).toBe(column);
  });
  it("preserves completion classification across atomic multi-column reorders", async () => {
    await db.query("update columns set name='Ready' where id=$1",[done]);
    await configure();
    await expect(asUser(db,1,"select update_board_columns($1,$2::jsonb)",[board,JSON.stringify([{id:column,position:1},{id:done,position:0}])])).rejects.toThrow(/column|explicit/i);
    expect((await db.query<{position:number}>("select position from columns where id=$1",[column])).rows[0].position).toBe(0);
    await asUser(db,1,"select update_board_columns($1,$2::jsonb)",[board,JSON.stringify([{id:column,name:"In Progress",position:10},{id:done,position:20}])]);
    expect((await details()).revision).toBe(1);
  });
  it("invalidates reviewed attachment refs and referenced field definitions",async()=>{
    const field="40000000-0000-4000-8000-000000000009";
    await asUser(db,1,"insert into custom_field_definitions(id,board_id,name,field_type) values($1,$2,'Scope','text')",[field,board]);
    await asUser(db,1,"insert into custom_field_values(card_id,field_id,value) values($1,$2,'\"Original\"')",[card,field]);
    await configure(); await request();
    await asUser(db,1,"update custom_field_definitions set name='Agreed scope' where id=$1",[field]);
    expect(await details()).toMatchObject({revision:2,status:"not_requested"});
    await asUser(db,1,"update attachments set storage_path=storage_path||'.new' where card_id=$1",[card]);
    expect((await details()).revision).toBe(3);
  });
  it("requires change/disable reasons, freezes timezone, and preserves withdrawal history",async()=>{
    await configure();
    await db.query("insert into board_workflow_settings(board_id,timezone) values($1,'Asia/Kolkata') on conflict(board_id) do update set timezone=excluded.timezone",[board]);
    const requestId=await request();
    await db.query("update board_workflow_settings set timezone='America/New_York' where board_id=$1",[board]);
    expect((await details()).current_request).toMatchObject({review_timezone:"Asia/Kolkata"});
    await expect(transition(2,"request_changes",{requestId,note:" "})).rejects.toThrow(/reason/i);
    await transition(2,"request_changes",{requestId,note:"Fix the result"});
    expect((await details()).status).toBe("changes_requested");
    const second=await request();
    await transition(1,"withdraw",{requestId:second});
    expect((await details()).status).toBe("not_requested");
    await expect(transition(1,"configure",{required:false,reviewerId:null})).rejects.toThrow(/reason/i);
    await transition(1,"configure",{required:false,reviewerId:null,reason:"Scope changed"});
    const history=(await details()).history as {action:string}[];
    expect(history.map(h=>h.action)).toEqual(expect.arrayContaining(["requested","changes_requested","withdrawn","configured"]));
  });
  it("atomically emits durable review events and deduplicates recipients and operation retries",async()=>{
    await configure(); const requestId=await request();
    const operationId=operation();
    await transition(2,"approve",{operationId,requestId});
    await transition(2,"approve",{operationId,requestId});
    expect((await db.query("select type,recipient_id from notifications where type like 'review_%' order by type")).rows).toEqual([
      {type:"review_approved",recipient_id:uid(1)},{type:"review_requested",recipient_id:uid(2)}
    ]);
    expect((await db.query<{n:number}>("select count(*)::int n from workflow_deliveries")).rows[0].n).toBe(2);
  });
  it("protects attachment files before Storage deletion can bypass completed-content guards",async()=>{
    await configure(); const requestId=await request(); await transition(2,"approve",{requestId});
    await asUser(db,1,"update cards set column_id=$1 where id=$2",[done,card]);
    await expect(db.query("delete from storage.objects where name=$1",[card+"/secret.txt"])).rejects.toThrow(/reopen/i);
    expect((await db.query("select id from storage.objects where name=$1",[card+"/secret.txt"])).rows).toHaveLength(1);
  });
  it("revoked reviewers cannot decide or read, replacement creates a fresh revision", async () => {
    await configure(); const requestId = await request();
    await db.query("delete from team_members where user_id=$1", [uid(2)]);
    await expect(transition(2, "approve", { requestId })).rejects.toThrow(/access|forbidden/i);
    await expect(details(2)).rejects.toThrow(/access|forbidden/i);
    await expect(transition(1, "request", { reviewDueDate: "2099-01-01" })).rejects.toThrow();
  });
  it("inherits recurring configuration without approved or blocked state", async () => {
    await configure();
    const copy = "30000000-0000-4000-8000-000000000009";
    await asUser(db, 1, "insert into cards(id,board_id,column_id,title,position,created_by,recurrence_parent_id,is_blocked,blocked_reason) values($1,$2,$3,'Copy',1,$4,$5,true,'Previous block')", [copy, board, column, uid(1), card]);
    expect(await details(1, copy)).toMatchObject({ required: true, reviewer_id: uid(2), revision: 1, status: "not_requested" });
    expect((await db.query<{is_blocked:boolean}>("select is_blocked from cards where id=$1", [copy])).rows[0].is_blocked).toBe(false);
  });
  it("includes reviewer-only attention once and full pending counts beyond 1000 rows", async () => {
    await configure(); await request();
    await db.exec(`insert into cards(board_id,column_id,title,position,created_by) select '${board}','${column}','Review '||n,n,'${uid(1)}' from generate_series(1,1001) n;
      insert into card_approval_settings(card_id,required,reviewer_id) select id,true,'${uid(2)}' from cards where title like 'Review %';
      insert into approval_requests(card_id,revision,requester_id,reviewer_id,review_due_date,review_timezone,status) select id,1,'${uid(1)}','${uid(2)}','2099-01-01','UTC','pending' from cards where title like 'Review %';`);
    const attention = await asUser(db, 2, "select my_work('attention') as value");
    expect(attention.rows[0].value).toMatchObject({ total: 1002, counts: { pendingMyReview: 1002 } });
    expect((attention.rows[0].value as {items:unknown[]}).items).toHaveLength(50);
    const mine = await asUser(db, 2, "select my_work('mine') as value");
    expect((mine.rows[0].value as {total:number}).total).toBe(0);
  });
});
