import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { asUser, conversation, database, uid } from './fixture';
let db:PGlite;
beforeAll(async()=>{db=await database({policyOnly:true});});
afterAll(async()=>{await db?.close();});
async function createGroup(type='group',name:string|null='QA group',members=[uid(2)],actor=1) { return (await asUser(db,actor,'select create_conversation($1,$2,$3) id',[type,name,members])).rows[0] as {id:string}; }
async function group() { return (await createGroup()).id; }
const manage=(id:string, action:string, target:string|null=null, name:string|null=null, actor=1)=>asUser(db,actor,'select manage_group($1,$2,$3,$4)',[id,action,target,name]);
it('locks the conversation before delete authorization reads the caller membership',async()=>{
  const id=await group();
  // Observe the tuple lock at the auth boundary, without pretending this
  // single-session fixture can reproduce independent-session lock waiting.
  await db.exec(`create or replace function auth.uid() returns uuid language plpgsql as $$
  begin
    if not exists(select 1 from public.conversations where id='${id}' and xmax::text::bigint=mod(txid_current(),4294967296)) then
      raise exception 'Authorization ran before conversation lock';
    end if;
    return nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  end; $$;`);
  try {
    await expect(asUser(db,1,'select delete_conversation($1)',[id])).resolves.toMatchObject({rows:[{delete_conversation:true}]});
  } finally {
    await db.exec("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$");
  }
  expect((await db.query('select id from conversations where id=$1',[id])).rows).toEqual([]);
});
it('denies outsiders and ordinary members admin actions',async()=>{
  const id=await group();
  for(const actor of [2,3]) for(const action of ['rename','add','remove','promote','demote']) await expect(manage(id,action,uid(3),'Changed',actor)).rejects.toThrow(/Forbidden|admin/i);
});
it('renames, adds idempotently, promotes, demotes and removes with immediate access revocation',async()=>{
  const id=await group();
  await manage(id,'rename',null,'  Renamed  ');
  await manage(id,'add',uid(3)); await manage(id,'add',uid(3));
  expect((await asUser(db,3,'select name from conversations where id=$1',[id])).rows).toEqual([{name:'Renamed'}]);
  expect((await asUser(db,1,'select is_admin from conversation_members where conversation_id=$1 and user_id=$2',[id,uid(3)])).rows).toEqual([{is_admin:false}]);
  await manage(id,'promote',uid(3)); await manage(id,'promote',uid(3));
  await manage(id,'demote',uid(3)); await manage(id,'demote',uid(3));
  await manage(id,'remove',uid(3)); await manage(id,'remove',uid(3));
  expect((await asUser(db,3,'select * from conversations where id=$1',[id])).rows).toEqual([]);
});
it('allows member self-leave without deleting group or messages',async()=>{
  const id=await group();
  await manage(id,'leave',null,null,2); await manage(id,'leave',null,null,2);
  expect((await asUser(db,2,'select * from conversations where id=$1',[id])).rows).toEqual([]);
  expect((await asUser(db,1,'select id from conversations where id=$1',[id])).rows).toHaveLength(1);
  expect((await asUser(db,1,'select content from messages where conversation_id=$1',[conversation])).rows).toHaveLength(1);
});
it('guards the last admin against leave, self-remove and demotion until promoted replacement exists',async()=>{
  const id=await group();
  for(const action of ['leave','remove','demote']) await expect(manage(id,action,action==='leave'?null:uid(1))).rejects.toThrow(/last admin/i);
  await manage(id,'promote',uid(2)); await manage(id,'leave');
  expect((await asUser(db,2,'select is_admin from conversation_members where conversation_id=$1',[id])).rows).toEqual([{is_admin:true}]);
  await expect(manage(id,'leave',uid(2),null,2)).rejects.toThrow(/last admin/i);
});
it('serializes conflicting admin changes and preserves at least one admin',async()=>{
  const id=await group(); await manage(id,'promote',uid(2));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid(1)}'`);
  try {
    const outcomes=await Promise.allSettled([db.query("select manage_group($1,'demote',$2)",[id,uid(2)]),db.query("select manage_group($1,'leave')",[id])]);
    expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  } finally { await db.exec('reset role'); }
  expect((await db.query('select user_id from conversation_members where conversation_id=$1 and is_admin',[id])).rows).toHaveLength(1);
});
it('prevents direct membership deletion and conversation metadata changes while preserving receipts',async()=>{
  await expect(asUser(db,1,'delete from conversation_members where conversation_id=$1 and user_id=$2',[conversation,uid(1)])).rejects.toThrow(/permission denied/i);
  await expect(asUser(db,1,"update conversations set type='direct' where id=$1",[conversation])).rejects.toThrow(/permission denied/i);
  await asUser(db,2,'update conversation_members set last_read_at=now() where conversation_id=$1 and user_id=$2',[conversation,uid(2)]);
});
it('validates names, missing profiles, empty selections and the 50-member boundary at RPC creation and mutation',async()=>{
  for(const name of [null,'','  ','\t\n','x'.repeat(101)]) await expect(asUser(db,1,"select create_conversation('group',$1,$2)",[name,[uid(2)]])).rejects.toThrow(/name/i);
  for(const members of [[],[null],[uid(9)],Array(50).fill(uid(2))]) await expect(asUser(db,1,"select create_conversation('group','QA',$1)",[members])).rejects.toThrow();
  await expect(asUser(db,1,"select create_conversation('group','QA',$1)",[['invalid-uuid']])).rejects.toThrow(/uuid/i);
  const id=await group();
  for(const name of ['', ' '.repeat(2),'\t\n','x'.repeat(101)]) await expect(manage(id,'rename',null,name)).rejects.toThrow(/name/i);
  await expect(manage(id,'add',uid(9))).rejects.toThrow(/member|profile|user/i);
  await expect(manage(id,'add','invalid-uuid')).rejects.toThrow(/uuid/i);
  await expect(manage(id,'leave',uid(2))).rejects.toThrow(/self|leave/i);
  await db.exec("insert into auth.users(id,email) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'group'||n||'@example.test' from generate_series(10,57) n");
  const ids=(await db.query<{id:string}>("select id from profiles where email like 'group%@example.test' order by email")).rows.map(p=>p.id);
  const full=(await createGroup('group','Full',[uid(2),...ids])).id;
  await manage(full,'add',uid(2));
  await expect(manage(full,'add',uid(3))).rejects.toThrow(/50|limit|maximum/i);
});
it('returns only current-member group details and denies ordinary members deleting for everyone',async()=>{
  const id=await group();
  const result=(await asUser(db,2,'select group_details($1) details',[id])).rows[0] as {details:{name:string;members:{id:string;is_admin:boolean;email:string}[]}};
  expect(result.details.name).toBe('QA group');
  expect(result.details.members.map(m=>[m.id,m.is_admin])).toEqual([[uid(1),true],[uid(2),false]]);
  expect(result.details.members[0].email).toBe('owner@example.test');
  await expect(asUser(db,3,'select group_details($1)',[id])).rejects.toThrow(/Forbidden/);
  await expect(asUser(db,2,'select delete_conversation($1)',[id])).rejects.toThrow(/admin/i);
  await manage(id,'remove',uid(2));
  await expect(asUser(db,2,'select group_details($1)',[id])).rejects.toThrow(/Forbidden/);
});
it('rejects direct and board mutations while keeping direct deduplication',async()=>{
  const direct=(await createGroup('direct',null)).id;
  expect((await createGroup('direct',null,[uid(1)],2)).id).toBe(direct);
  await expect(manage(direct,'rename',null,'No')).rejects.toThrow(/group/i);
  const boardId=(await db.query<{id:string}>("insert into conversations(type,created_by) values('board',$1) returning id",[uid(1)])).rows[0].id;
  await expect(manage(boardId,'add',uid(2))).rejects.toThrow(/group/i);
});
it('replays migration without rewriting legacy unnamed groups, messages or memberships',async()=>{
  const before=(await db.query('select * from conversation_members where conversation_id=$1 order by user_id',[conversation])).rows;
  const sql=fs.readFileSync('supabase/migrations/20261101_group_management.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  expect((await db.query('select name from conversations where id=$1',[conversation])).rows).toEqual([{name:null}]);
  expect((await db.query('select * from conversation_members where conversation_id=$1 order by user_id',[conversation])).rows).toEqual(before);
  expect((await db.query('select content from messages where conversation_id=$1',[conversation])).rows).toHaveLength(1);
});
