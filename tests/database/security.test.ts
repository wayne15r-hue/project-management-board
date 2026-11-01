import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { asUser, board, card, column, conversation, database, team, uid } from "./fixture";

describe("database authorization", () => {
  let db: PGlite;
  beforeAll(async () => { db = await database({ policyOnly: true, legacy: process.env.TEST_LEGACY === "1" }); }, 30000);
  afterAll(async () => { await db?.close(); });
  it("denies outsider label, card-label, attachment and private object access", async () => {
    await db.exec(`insert into card_labels(card_id,label_id) values ('${card}','40000000-0000-4000-8000-000000000001')`);
    for (const table of ["labels", "card_labels", "attachments"]) {
      expect((await asUser(db, 3, `select * from public.${table}`)).rows).toEqual([]);
      expect((await asUser(db, 3, `delete from public.${table} returning *`)).rows).toEqual([]);
    }
    expect((await asUser(db, 3, "select * from storage.objects")).rows).toEqual([]);
    expect((await asUser(db, 1, "select * from public.attachments")).rows).toHaveLength(1);
    expect((await asUser(db, 2, "select * from storage.objects")).rows).toHaveLength(2);
    await expect(asUser(db, 3, `insert into storage.objects(bucket_id,name) values ('attachments','${card}/evil')`)).rejects.toThrow();
    await expect(asUser(db, 3, `insert into labels(board_id,name) values ('${board}','Intruder')`)).rejects.toThrow();
    expect((await asUser(db,2,"update labels set name='Member edit' returning name")).rows).toEqual([{name:"Member edit"}]);
    await asUser(db,2,`insert into storage.objects(bucket_id,name) values ('attachments','${card}/new.txt')`);
    expect((await asUser(db,2,`delete from storage.objects where name='${card}/new.txt' returning name`)).rows).toHaveLength(1);
  });
  it("denies self-joining chat and privilege escalation, preserves read receipts", async () => {
    await expect(asUser(db, 3, `insert into conversation_members(conversation_id,user_id,is_admin) values ('${conversation}',auth.uid(),true)`)).rejects.toThrow();
    await expect(asUser(db, 2, "update conversation_members set is_admin=true where user_id=auth.uid()")).rejects.toThrow();
    await expect(asUser(db, 2, "update conversation_members set user_id='00000000-0000-4000-8000-000000000003' where user_id=auth.uid()")).rejects.toThrow();
    await asUser(db, 2, "update conversation_members set last_read_at=now() where user_id=auth.uid()");
    await expect(asUser(db, 2, `select delete_conversation('${conversation}')`)).rejects.toThrow();
    expect((await asUser(db, 3, "select * from messages")).rows).toEqual([]);
  });
  it("hides legacy profile keys and prevents client secret writes", async () => {
    await expect(asUser(db, 3, "select anthropic_api_key from profiles")).rejects.toThrow();
    await expect(asUser(db, 1, "update profiles set anthropic_api_key='new'")).rejects.toThrow();
    expect((await asUser(db, 3, "select id,full_name,email from profiles")).rows).toHaveLength(3);
    expect((await db.query("select anthropic_api_key from profiles where anthropic_api_key is not null")).rows).toEqual([{anthropic_api_key:"dummy-audit-key-not-a-secret"}]);
  });
  it("lets collaborators edit content without taking board ownership", async () => {
    await asUser(db, 2, `update boards set name='Collaborative' where id='${board}'`);
    await expect(asUser(db, 2, `update boards set owner_id=auth.uid() where id='${board}'`)).rejects.toThrow();
    expect((await asUser(db, 2, `delete from boards where id='${board}' returning id`)).rows).toEqual([]);
  });
  it("rejects cross-board card columns and labels", async () => {
    await expect(asUser(db, 1, `update cards set column_id='20000000-0000-4000-8000-000000000002' where id='${card}'`)).rejects.toThrow();
    await db.exec("insert into labels(id,board_id,name) values ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other')");
    await expect(db.exec(`insert into card_labels(card_id,label_id) values ('${card}','40000000-0000-4000-8000-000000000002')`)).rejects.toThrow();
    await asUser(db, 2, `insert into card_labels(card_id,label_id) values ('${card}','40000000-0000-4000-8000-000000000001') on conflict do nothing`);
  });
  it("bootstraps a team and permits only admin invitation and addressed acceptance", async () => {
    expect((await asUser(db, 1, "select * from team_members")).rows).toHaveLength(2);
    const created = await asUser(db, 3, "select create_team('New team') as id");
    expect(created.rows).toHaveLength(1);
    await expect(asUser(db, 3, `select invite_team_member('${team}','other@example.test')`)).rejects.toThrow();
    await expect(asUser(db, 2, `select invite_team_member('${team}','outsider@example.test')`)).rejects.toThrow();
    const result = await asUser(db, 1, `select (invite_team_member('${team}','OUTSIDER@example.test')).token as token`);
    const token = (result.rows[0] as {token:string}).token;
    await expect(asUser(db, 2, `select accept_team_invite('${token}')`)).rejects.toThrow();
    await asUser(db, 3, `select accept_team_invite('${token}')`);
    await asUser(db, 3, `select accept_team_invite('${token}')`);
    expect((await asUser(db, 3, `select * from team_members where team_id='${team}'`)).rows).toHaveLength(3);
  });
  it("allows only comment authors with current access to edit/delete comments", async () => {
    expect((await asUser(db, 2, "update activity_log set changes='{}' returning id")).rows).toEqual([]);
    expect((await asUser(db, 1, "update activity_log set changes='{\"text\":\"Edited\"}' returning id")).rows).toHaveLength(1);
    await expect(asUser(db, 1, "update activity_log set actor_id='00000000-0000-4000-8000-000000000002'")).rejects.toThrow();
    expect((await asUser(db, 1, "delete from activity_log returning id")).rows).toHaveLength(1);
    await db.exec(`insert into activity_log(card_id,actor_id,action,changes) values ('${card}','${uid(1)}','moved','{}')`);
    expect((await asUser(db,1,"update activity_log set changes='{}' returning id")).rows).toEqual([]);
    expect((await asUser(db,1,"delete from activity_log returning id")).rows).toEqual([]);
  });
  it("allows creator/admin conversation bootstrap and deletion without granting direct membership writes",async () => {
    const made = await asUser(db,1,`select create_conversation('group','Legitimate',array['${uid(2)}']::uuid[]) as id`);
    const id = (made.rows[0] as {id:string}).id;
    expect((await asUser(db,2,`select * from conversation_members where conversation_id='${id}'`)).rows).toHaveLength(2);
    await asUser(db,1,`select delete_conversation('${id}')`);
    expect((await db.query(`select id from conversations where id='${id}'`)).rows).toEqual([]);
  });
  it("makes quota rows read-only and reservations atomic at the daily limit", async () => {
    expect((await asUser(db, 3, "select * from ai_usage")).rows).toHaveLength(1);
    await expect(asUser(db, 3, "delete from ai_usage")).rejects.toThrow();
    await expect(asUser(db, 3, `insert into ai_usage(user_id,feature) values (auth.uid(),'chat')`)).rejects.toThrow();
    await expect(asUser(db, 3, "update ai_usage set feature='forged'")).rejects.toThrow();
    await expect(asUser(db, 3, `select reserve_ai_usage('${uid(3)}','chat')`)).rejects.toThrow();
    await db.exec(`insert into ai_usage(user_id,feature) select '${uid(1)}','chat' from generate_series(1,49)`);
    await db.exec("set role service_role");
    const reservations = await Promise.allSettled([db.query(`select reserve_ai_usage('${uid(1)}','chat')`), db.query(`select reserve_ai_usage('${uid(1)}','chat')`)]);
    await db.exec("reset role");
    expect(reservations.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.query(`select count(*)::int as count from ai_usage where user_id='${uid(1)}'`)).rows).toEqual([{count:50}]);
  });
});

it("expires stale invitations on resend and accepts the replacement exactly once under queued retries",async () => {
  const db=await database({policyOnly:true});
  try {
    const first=await asUser(db,1,`select (invite_team_member('${team}','outsider@example.test')).token as token`);
    const oldToken=(first.rows[0] as {token:string}).token;
    await db.exec("update invites set expires_at=now()-interval '1 second'");
    await expect(asUser(db,3,`select accept_team_invite('${oldToken}')`)).rejects.toThrow(/expired/);
    const next=await asUser(db,1,`select (invite_team_member('${team}','outsider@example.test')).token as token`);
    const token=(next.rows[0] as {token:string}).token;
    expect(token).not.toBe(oldToken);
    expect((await db.query("select status from invites order by created_at")).rows).toEqual([{status:"expired"},{status:"pending"}]);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid(3)}'`);
    const accepted=await Promise.all([db.query(`select accept_team_invite('${token}') as id`),db.query(`select accept_team_invite('${token}') as id`)]);
    expect(accepted.map(r=>r.rows)).toEqual([[{id:team}],[{id:team}]]);
    await db.exec("reset role");
    expect((await db.query(`select * from team_members where team_id='${team}' and user_id='${uid(3)}'`)).rows).toHaveLength(1);
    await expect(asUser(db,1,`select invite_team_member('${team}','outsider@example.test')`)).rejects.toThrow(/already a team member/);
  } finally {await db.exec("reset role");await db.close();}
},30000);

it("rolls back team creation and invitation consumption when membership insertion fails",async () => {
  const db=await database({policyOnly:true});
  try {
    const result=await asUser(db,1,`select (invite_team_member('${team}','outsider@example.test')).token as token`);
    const token=(result.rows[0] as {token:string}).token;
    await db.exec("create function reject_membership() returns trigger language plpgsql as $$begin raise exception 'membership failed';end$$;create trigger membership_failure before insert on team_members for each row execute function reject_membership()");
    await expect(asUser(db,3,"select create_team('Must roll back')")).rejects.toThrow("membership failed");
    expect((await db.query("select * from teams where name='Must roll back'")).rows).toEqual([]);
    await expect(asUser(db,3,`select accept_team_invite('${token}')`)).rejects.toThrow("membership failed");
    expect((await db.query(`select status from invites where token='${token}'`)).rows).toEqual([{status:"pending"}]);
  } finally {await db.close();}
},30000);

it("preserves an existing manually enabled read-receipt publication during hardening",async () => {
  const db=await database({legacy:true});
  try {
    await db.exec("alter publication supabase_realtime add table public.conversation_members");
    await db.exec(fs.readFileSync("supabase/migrations/20261101_audit_hardening.sql","utf8"));
    expect((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_members'")).rows).toHaveLength(1);
  } finally {await db.close();}
},30000);

it("makes private buckets private even when a legacy environment drifted to public access",async () => {
  const db=await database({legacy:true});
  try {
    await db.exec("update storage.buckets set public=true where id in ('attachments','chat-files')");
    await db.exec(fs.readFileSync("supabase/migrations/20261101_audit_hardening.sql","utf8"));
    expect((await db.query("select public from storage.buckets where id in ('attachments','chat-files')")).rows).toEqual([{public:false},{public:false}]);
  } finally {await db.close();}
},30000);

it("prevents TRUNCATE from bypassing private data and server-managed quota policies",async () => {
  const db=await database({policyOnly:true});
  try {
    await expect(asUser(db,3,"truncate ai_usage")).rejects.toThrow();
    await expect(asUser(db,3,"truncate storage.objects")).rejects.toThrow();
  } finally {await db.close();}
},30000);

it("keeps a single unambiguous foreign-key relation per card-label endpoint",async () => {
  const db=await database({policyOnly:true});
  try {
    expect((await db.query("select confrelid::regclass::text as target,count(*)::int as count from pg_constraint where conrelid='public.card_labels'::regclass and contype='f' group by confrelid order by target")).rows).toEqual([{target:"cards",count:1},{target:"labels",count:1}]);
  } finally {await db.close();}
},30000);

it("stops legacy cross-board preflight without losing data and applies after explicit repair",async () => {
  const db=await database({policyOnly:true,legacy:true});
  try {
    await db.exec(`update cards set column_id='20000000-0000-4000-8000-000000000002' where id='${card}';
      insert into labels(id,board_id,name) values ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other');
      insert into card_labels(card_id,label_id) values ('${card}','40000000-0000-4000-8000-000000000002');`);
    const migration=fs.readFileSync("supabase/migrations/20261101_audit_hardening.sql","utf8").replace(/alter publication supabase_realtime add table [^;]+;/g,"");
    await expect(db.exec(migration)).rejects.toThrow(/Audit preflight: 1 cards.*1 card-label/);
    await db.exec("rollback");
    expect((await db.query("select * from cards")).rows).toHaveLength(1);
    expect((await db.query("select * from card_labels")).rows).toHaveLength(1);
    await db.exec(`update cards set column_id='${column}' where id='${card}'; update labels set board_id='${board}' where id='40000000-0000-4000-8000-000000000002';`);
    await db.exec(migration);
    expect((await db.query("select * from card_labels")).rows).toHaveLength(1);
  } finally {await db.close();}
},30000);

it("checks notification card/board, actor and recipient through the service-only RPC",async () => {
  const db=await database({policyOnly:true});
  try {
    await expect(asUser(db,1,`select notification_recipient_allowed('${card}','${board}','${uid(1)}','${uid(2)}')`)).rejects.toThrow();
    await db.exec("set role service_role");
    for(const [actor,recipient,expected] of [[1,2,true],[1,3,false],[3,1,false]] as const) {
      expect((await db.query(`select notification_recipient_allowed('${card}','${board}','${uid(actor)}','${uid(recipient)}') as allowed`)).rows).toEqual([{allowed:expected}]);
    }
    expect((await db.query(`select notification_recipient_allowed('${card}','10000000-0000-4000-8000-000000000002','${uid(1)}','${uid(2)}') as allowed`)).rows).toEqual([{allowed:false}]);
  } finally {await db.exec("reset role");await db.close();}
},30000);

it("returns unbounded per-conversation latest previews and unread counts only for members",async () => {
  const db=await database({policyOnly:true});
  try {
    await db.exec(`update conversation_members set last_read_at=now()-interval '1 day';
      insert into messages(conversation_id,sender_id,content,created_at) select '${conversation}','${uid(1)}','Message '||n,now()+n*interval '1 second' from generate_series(1,260) n;`);
    const summaries=await asUser(db,2,"select * from conversation_summaries()");
    expect(summaries.rows).toHaveLength(1);
    expect(summaries.rows[0]).toMatchObject({conversation_id:conversation,last_message:{content:"Message 260"},unread_count:261});
    expect((await asUser(db,3,"select * from conversation_summaries()")).rows).toEqual([]);
  } finally {await db.close();}
},30000);

it("applies the actual fresh migration chain with function checks and Realtime DDL", async () => {
  const db = await database({ seed: false });
  try {
    expect((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_members'")).rows).toHaveLength(1);
  } finally { await db.close(); }
}, 30000);

it("rolls back failed column relocation, then preserves cards and deterministic destination positions", async () => {
  const db = await database({policyOnly:true});
  try {
    await db.exec(`insert into columns(id,board_id,name,position) values ('20000000-0000-4000-8000-000000000003','${board}','Destination',1);
      insert into cards(board_id,column_id,title,position,created_by) values ('${board}','20000000-0000-4000-8000-000000000003','Existing',0,'${uid(1)}');
      create function reject_move() returns trigger language plpgsql as $$begin raise exception 'relocation failed'; end$$;
      create trigger fail_move before update on cards for each row execute function reject_move();`);
    await expect(asUser(db,1,`select delete_board_column('${board}','${column}')`)).rejects.toThrow("relocation failed");
    expect((await db.query(`select id from columns where id='${column}'`)).rows).toHaveLength(1);
    expect((await db.query("select * from cards")).rows).toHaveLength(2);
    await db.exec("drop trigger fail_move on cards");
    await asUser(db,1,`select delete_board_column('${board}','${column}')`);
    expect((await db.query("select title,position from cards order by position")).rows).toEqual([{title:"Existing",position:0},{title:"Secret title",position:1}]);
  } finally { await db.close(); }
},30000);

it("moves cards atomically, rejecting foreign columns and restoring contiguous source/destination order",async () => {
  const db = await database({policyOnly:true});
  try {
    await db.exec(`insert into columns(id,board_id,name,position) values ('20000000-0000-4000-8000-000000000003','${board}','Destination',1);
      insert into cards(board_id,column_id,title,position,created_by) values ('${board}','20000000-0000-4000-8000-000000000003','Existing',0,'${uid(1)}'), ('${board}','${column}','Second',1,'${uid(1)}');`);
    await expect(asUser(db,3,`select move_card('${card}','20000000-0000-4000-8000-000000000003',0)`)).rejects.toThrow();
    await expect(asUser(db,1,`select move_card('${card}','20000000-0000-4000-8000-000000000002',0)`)).rejects.toThrow();
    await asUser(db,2,`select move_card('${card}','20000000-0000-4000-8000-000000000003',0)`);
    expect((await db.query("select title,position from cards order by column_id,position")).rows).toEqual([{title:"Second",position:0},{title:"Secret title",position:0},{title:"Existing",position:1}]);
  } finally { await db.close(); }
},30000);

it("applies combined card moves and metadata atomically, preserving absent fields and explicit nulls",async () => {
  const db=await database({policyOnly:true});
  try {
    const destination="20000000-0000-4000-8000-000000000003";
    await db.exec(`insert into columns(id,board_id,name,position) values ('${destination}','${board}','Destination',1);
      insert into cards(board_id,column_id,title,position,created_by) values ('${board}','${destination}','Existing',0,'${uid(1)}'), ('${board}','${column}','Second',1,'${uid(1)}');
      update cards set description='Retained',due_date='2026-12-01T00:00:00Z' where id='${card}';`);
    const before=(await db.query("select title,column_id,position,description,due_date from cards order by column_id,position")).rows;
    await expect(asUser(db,2,`select move_card('${card}','${destination}',0,'{"title":"Changed","due_date":"not-a-timestamp"}'::jsonb)`)).rejects.toThrow(/invalid input syntax.*timestamp/);
    expect((await db.query("select title,column_id,position,description,due_date from cards order by column_id,position")).rows).toEqual(before);
    await expect(asUser(db,2,`select move_card('${card}','${destination}',0,'{"board_id":"${board}"}'::jsonb)`)).rejects.toThrow(/Unsupported card update/);
    await asUser(db,2,`select move_card('${card}','${destination}',0,'{"title":"Changed","description":null,"priority":"high","assignee_id":"${uid(2)}","cover_color":"#123456"}'::jsonb)`);
    expect((await db.query("select title,position from cards order by column_id,position")).rows).toEqual([{title:"Second",position:0},{title:"Changed",position:0},{title:"Existing",position:1}]);
    expect((await db.query(`select description,due_date,priority,assignee_id,cover_color from cards where id='${card}'`)).rows).toEqual([{description:null,due_date:new Date("2026-12-01T00:00:00Z"),priority:"high",assignee_id:uid(2),cover_color:"#123456"}]);
    await asUser(db,2,`select move_card('${card}','${destination}',0,'{"due_date":null,"assignee_id":null}'::jsonb)`);
    expect((await db.query(`select due_date,assignee_id,title from cards where id='${card}'`)).rows).toEqual([{due_date:null,assignee_id:null,title:"Changed"}]);
  } finally {await db.close();}
},30000);
