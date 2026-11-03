import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, board, database, uid } from './fixture';
import type { AccountOperation, DeletionPreview } from '../../src/types/accounts';

let db: PGlite;
beforeEach(async () => {
  db = await database();
  await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;
    alter table storage.objects add column owner uuid references auth.users, add column owner_id text;
    insert into employee_admin_members(user_id,role) values ('${uid(1)}','owner');
    insert into auth.users(id,email) values ('${uid(4)}','manager@example.test'),('${uid(5)}','worker@example.test'),('${uid(6)}','last@example.test');`);
});
afterEach(async () => { await db?.close(); });
const op = (n:number) => '90000000-0000-4000-8000-' + String(n).padStart(12,'0');
it('preserves provider-owned event-trigger functions during RPC wrapping',async()=>{
 await db.exec("create function public.qa_rls_auto_enable() returns event_trigger language plpgsql security definer as $$begin return;end$$;");
 await db.exec(fs.readFileSync('supabase/migrations/20261103_z_account_management.sql','utf8'));
 expect((await db.query("select prosrc from pg_proc where oid='public.qa_rls_auto_enable()'::regprocedure")).rows[0]).toEqual({prosrc:'begin return;end'});
});
const request = (actor:number,target:number,action:string,id:number,payload:object) =>
  asUser(db,actor,'select account_request_action($1,$2,$3,$4) as result',[uid(target),action,op(id),payload]);
async function claimed(id:number) {
  const result = await db.query<{jobs:AccountOperation[]}>('select account_claim_operations() jobs');
  const job = result.rows[0].jobs.find(job => job.id === op(id));
  expect(job?.lease_token).toBeTruthy();
  return job!.lease_token!;
}
const preview = async (target:number) => (await asUser(db,1,'select account_deletion_preview($1) result',[uid(target)])).rows[0] as {result:DeletionPreview};
async function deactivate(target:number,id:number){
 await request(1,target,'deactivate',id,{expectedRevision:1});
 await db.query('delete from audio_media_cleanup');
 await db.query("select account_finish_operation($1,$2,'succeeded',null)",[op(id),await claimed(id)]);
}
it('requires deactivation before deletion and enforces case-insensitive employee IDs',async()=>{
 const {result:p}=await preview(6);
 expect(p.blockers.join(' ')).toMatch(/deactivat/i);
 await expect(request(1,6,'delete',20,{expectedRevision:1,confirmationEmail:p.confirmationEmail,transfers:{}})).rejects.toThrow(/status|deactivat/i);
 await asUser(db,1,'select account_save_directory($1,$2)',[uid(5),{employeeId:'Emp-1'}]);
 await expect(asUser(db,1,'select account_save_directory($1,$2)',[uid(6),{employeeId:'eMP-1'}])).rejects.toThrow(/unique|duplicate/i);
});
it('keeps optional employment fields separate from user setup and filters directory',async()=>{
  const fields = { employeeId:'E-53',workLocation:'Pune',joiningDate:'2026-10-01',employmentType:'Contract' };
  await asUser(db,1,'select account_save_directory($1,$2)',[uid(5),fields]);
  expect((await asUser(db,5,'select account_own_directory() d')).rows[0]).toEqual({d:fields});
  const result = (await asUser(db,1,'select account_directory($1) d',[{q:'E-53',setup:'incomplete'}])).rows[0] as {d:{total:number;items:{record:unknown}[]}};
  expect(result.d.total).toBe(1); expect(result.d.items[0].record).toBeNull();
  await expect(asUser(db,2,'select account_directory($1)',[{}])).rejects.toThrow(/admin/i);
});
it('immediately rejects inactive JWTs at raw RLS, definer RPC, membership helpers and realtime',async()=>{
  await asUser(db,1,'select employee_set_admin($1,true)',[uid(2)]);
  await request(1,2,'deactivate',1,{expectedRevision:1});
  expect((await asUser(db,2,'select account_is_active() active')).rows[0]).toEqual({active:false});
  expect((await asUser(db,2,'select id from cards')).rows).toEqual([]);
  expect((await asUser(db,2,'select id from storage.objects')).rows).toEqual([]);
  expect((await asUser(db,2,'select id from realtime.messages')).rows).toEqual([]);
  await expect(asUser(db,2,"select create_team('Bypass')")).rejects.toThrow(/inactive/i);
  await expect(asUser(db,2,'select account_claim_operations()')).rejects.toThrow(/permission/i);
  const lease = await claimed(1);
  await db.query("select account_finish_operation($1,$2,'succeeded',null)",[op(1),lease]);
  await request(1,2,'reactivate',2,{expectedRevision:2});
  expect((await asUser(db,2,'select account_is_active() active')).rows[0]).toEqual({active:false});
  await db.query("select account_finish_operation($1,$2,'succeeded',null)",[op(2),await claimed(2)]);
  expect((await asUser(db,2,'select account_is_active() active,employee_admin_role() role')).rows[0]).toEqual({active:true,role:null});
  await asUser(db,1,'select employee_set_admin($1,true)',[uid(4)]);
  await expect(request(4,2,'deactivate',3,{expectedRevision:3})).rejects.toThrow(/owner/i);
  await expect(request(1,1,'delete',4,{})).rejects.toThrow(/owner|self/i);
});
it('invalidates unauthorized leases and limits password reset replays',async()=>{
  await asUser(db,1,'select employee_set_admin($1,true)',[uid(4)]);
  await request(4,6,'reset_password',5,{});
  await expect(request(4,6,'reset_password',6,{})).rejects.toThrow(/cooldown/i);
  const lease = await claimed(5);
  await asUser(db,1,'select employee_set_admin($1,false)',[uid(4)]);
  expect((await db.query('select account_validate_operation($1,$2) ok',[op(5),lease])).rows[0]).toEqual({ok:false});
});
it('protects private board contents and atomically preserves work through Auth deletion',async()=>{
  const before = await preview(2);
  expect(before.result.blockers.length).toBeGreaterThan(0);
  expect(JSON.stringify(before)).not.toContain('Other board');
  await db.query("insert into board_teams(board_id,team_id) values('10000000-0000-4000-8000-000000000002',$1)",['70000000-0000-4000-8000-000000000001']);
  await db.query("update storage.objects set owner=$1::uuid,owner_id=($1::uuid)::text where bucket_id='chat-files'",[uid(2)]);
  await deactivate(2,21);
  const {result:p} = await preview(2);
  expect(p.blockers).toEqual([]);
  const transfers = Object.fromEntries(p.requirements.map(r=>[r.key,r.candidates[0]?.id??null]));
  const payload={expectedRevision:p.revision,confirmationEmail:p.confirmationEmail,transfers};
  await expect(db.query('delete from auth.users where id=$1',[uid(2)])).rejects.toThrow(/prepared|authorized/i);
  await request(1,2,'delete',7,payload);
  const lease = await claimed(7);
  await expect(db.query("select account_finish_operation($1,$2,'succeeded',null)",[op(7),lease])).rejects.toThrow();
  await db.query('select account_prepare_delete($1,$2)',[op(7),lease]);
  await db.query('delete from auth.users where id=$1',[uid(2)]);
  await db.query("select account_finish_operation($1,$2,'succeeded',null)",[op(7),lease]);
  expect((await db.query('select full_name,auth_user_id from profiles where id=$1',[uid(2)])).rows[0]).toEqual({full_name:'Deleted user',auth_user_id:null});
  expect((await db.query("select owner_id from storage.objects where bucket_id='chat-files'")).rows[0]).toEqual({owner_id:uid(1)});
  expect((await db.query('select id from boards where id=$1',[board])).rows).toHaveLength(1);
});


it('excludes inactive identities from pickers and rejects reassignment through existing writers',async()=>{
  await request(1,2,'deactivate',8,{expectedRevision:1});
  expect((await asUser(db,1,"select account_identity_search('other',null,100) d")).rows[0]).toEqual({d:[]});
  expect((await asUser(db,1,"select employee_manager_search('other') d")).rows[0]).toEqual({d:[]});
  await expect(db.query('update cards set assignee_id=$1',[uid(2)])).rejects.toThrow(/active/i);
  await expect(asUser(db,1,"select employee_submit((select id from employee_departments limit 1),'Manager',$1)",[uid(2)])).rejects.toThrow(/active/i);
  await expect(asUser(db,1,"select manage_group('60000000-0000-4000-8000-000000000001','add',$1)",[uid(2)])).resolves.toBeTruthy(); // existing membership remains
});
it('a reset with an expired provider lease is ambiguous and never claimed again', async()=>{
  await request(1,6,'reset_password',9,{});
  const lease=await claimed(9);
  await db.query('select account_begin_reset($1,$2)',[op(9),lease]);
  await db.query("update account_private.operations set lease_until=now()-interval '1 second' where id=$1",[op(9)]);
  expect((await db.query("select account_claim_operations() jobs")).rows[0]).toEqual({jobs:[]});
  await db.query("select account_finish_operation($1,$2,'succeeded',null)",[op(9),lease]);
  await expect(asUser(db,1,"select account_retry_operation($1)",[op(9)])).rejects.toThrow(/cannot/i);
  expect((await asUser(db,1,"select account_operation($1,$2)->>'status' s",[uid(6),op(9)])).rows[0]).toEqual({s:'ambiguous'});
});
it('reclaims an unattempted reset after a worker stops before contacting the provider',async()=>{
 await request(1,6,'reset_password',23,{});
 await claimed(23);
 await db.query("update account_private.operations set lease_until=now()-interval '1 second' where id=$1",[op(23)]);
 expect((await db.query<{jobs:AccountOperation[]}>('select account_claim_operations() jobs')).rows[0].jobs).toHaveLength(1);
});
it('allows the owner to take over a failed deletion with a new reviewed operation',async()=>{
 await asUser(db,1,'select employee_set_admin($1,true)',[uid(4)]);
 await deactivate(6,24);
 const {result:p}=await preview(6);
 await request(4,6,'delete',25,{expectedRevision:p.revision,confirmationEmail:p.confirmationEmail,transfers:{}});
 const lease=await claimed(25);
 await asUser(db,1,'select employee_set_admin($1,false)',[uid(4)]);
 await db.query('select account_validate_operation($1,$2)',[op(25),lease]);
 const next=(await preview(6)).result;
 await request(1,6,'delete',26,{expectedRevision:next.revision,confirmationEmail:next.confirmationEmail,transfers:{}});
 expect((await asUser(db,1,'select account_operation($1,$2)->>\'actor_id\' actor',[uid(6),op(26)])).rows[0]).toEqual({actor:uid(1)});
});
it('revokes Auth sessions and requires cleanup of personal avatars and call media',async()=>{
  await db.exec(`create table auth.sessions(id uuid default gen_random_uuid(),user_id uuid);
    create table auth.refresh_tokens(user_id text);
    insert into auth.sessions(user_id) values('${uid(6)}');insert into auth.refresh_tokens values('${uid(6)}');
    insert into storage.objects(bucket_id,name) values('avatars','${uid(6)}/personal.png');
    insert into conversation_members(conversation_id,user_id) values('60000000-0000-4000-8000-000000000001','${uid(6)}');`);
  await asUser(db,6,"select audio_call_start('60000000-0000-4000-8000-000000000001',true)");
  await request(1,6,'deactivate',22,{expectedRevision:1});
  const deactivationLease=await claimed(22);
  await db.query("select account_finish_operation($1,$2,'failed',null)",[op(22),deactivationLease]);
  const {result:p}=await preview(6);
  await request(1,6,'delete',10,{expectedRevision:p.revision,confirmationEmail:p.confirmationEmail,transfers:{}});
  expect((await db.query('select * from auth.sessions')).rows).toEqual([]);
  expect((await db.query('select * from auth.refresh_tokens')).rows).toEqual([]);
  const lease=await claimed(10);
  const prep=await db.query<{result:{avatarPaths:unknown[]}}>('select account_prepare_delete($1,$2) result',[op(10),lease]);
  expect(prep.rows[0].result.avatarPaths).toHaveLength(1);
  await expect(db.query('delete from auth.users where id=$1',[uid(6)])).rejects.toThrow(/incomplete/i);
  await db.query("delete from storage.objects where bucket_id='avatars'");
  await expect(db.query('delete from auth.users where id=$1',[uid(6)])).rejects.toThrow(/incomplete/i);
  await db.query('delete from audio_media_cleanup');
  await db.query('delete from auth.users where id=$1',[uid(6)]);
});
