import { afterAll, beforeAll, expect, it } from 'vitest';
import { database, asUser, card, board, uid } from './fixture';
import type { PGlite } from '@electric-sql/pglite';
let db:PGlite;
beforeAll(async()=>{db=await database({policyOnly:true});});
afterAll(async()=>{await db?.close();});
it('captures assignments transactionally and deduplicates legacy adapters',async()=>{
 await db.exec('update workflow_runtime set producers_enabled=true');
 await asUser(db,1,'update cards set assignee_id=$1 where id=$2',[uid(2),card]);
 expect((await db.query('select type from notifications')).rows).toEqual([{type:'assignment'}]);
 await db.query('select workflow_notify_legacy($1,$2,$3,$4,$5,$6,$7,$8)',[card,board,uid(1),uid(2),'assignment',null,'Legacy',null]);
 expect((await db.query('select count(*)::int n from workflow_deliveries')).rows).toEqual([{n:1}]);
 await db.exec('begin');
 await db.query("insert into activity_log(card_id,actor_id,action,changes) values($1,$2,'commented','{\"text\":\"Hi @other\"}')",[card,uid(1)]);
 await db.exec('rollback');
 expect((await db.query('select count(*)::int n from notifications')).rows).toEqual([{n:1}]);
});
it('hides revoked notifications and rejects private worker access',async()=>{
 expect((await asUser(db,2,'select id from notifications')).rows).toHaveLength(1);
 await db.query('delete from team_members where user_id=$1',[uid(2)]);
 expect((await asUser(db,2,'select id from notifications')).rows).toHaveLength(0);
 await expect(asUser(db,1,'select * from workflow_deliveries')).rejects.toThrow(/permission/);
});

it('ignores delayed assignment adapters and captures comments with mention precedence',async()=>{
 await db.query('insert into team_members(team_id,user_id,role) values($1,$2,\'member\')',['70000000-0000-4000-8000-000000000001',uid(2)]);
 await asUser(db,1,'update cards set assignee_id=null where id=$1',[card]);
 const before=(await db.query('select count(*)::int n from notifications')).rows;
 await db.query('select workflow_notify_legacy($1,$2,$3,$4,$5,$6,$7,$8)',[card,board,uid(1),uid(2),'assignment',null,'Stale',null]);
 expect((await db.query('select count(*)::int n from notifications')).rows).toEqual(before);
 await db.query("insert into activity_log(card_id,actor_id,action,changes) values($1,$2,'commented','{\"text\":\"Hi @other\"}')",[card,uid(1)]);
 expect((await db.query("select type from notifications where type in ('comment','mention')")).rows).toEqual([{type:'mention'}]);
});

it('generates all eligible tasks beyond 1000 with once-only phases and honest disabled delivery',async()=>{
 await asUser(db,1,"select workflow_board_settings($1,'{\"action\":\"save\",\"scheduling_enabled\":true,\"timezone\":\"UTC\"}')",[board]);
 await db.query("insert into cards(board_id,column_id,title,position,created_by,assignee_id,due_date) select $1,$2,'Scheduled '||n,n,$3,$4,date_trunc('day',now()) from generate_series(1,1001)n",[board,'20000000-0000-4000-8000-000000000001',uid(1),uid(2)]);
 await db.exec('select workflow_generate();select workflow_generate()');
 expect((await db.query("select count(*)::int n from notifications where type='due_today'")).rows).toEqual([{n:1001}]);
 await db.exec("select workflow_claim_deliveries(false,'','https://example.test')");
 expect((await db.query("select count(*)::int n from workflow_deliveries where status='accepted'")).rows).toEqual([{n:0}]);
 expect((await db.query("select count(*)::int n from workflow_deliveries where status in ('disabled','cancelled')")).rows).toEqual([{n:25}]);
});

it('freezes provider payload/key across expired leases and stops outside dedup window',async()=>{
 const first=(await db.query<{jobs:Array<{id:string;lease_token:string;payload:unknown;provider_key:string}>}>("select workflow_claim_deliveries(true,'sender@example.test','https://example.test') jobs")).rows[0].jobs[0];
 expect(first).toBeDefined();
 await db.query("update workflow_deliveries set lease_until=now()-interval '1 minute' where id=$1",[first.id]);
 const retry=(await db.query<{jobs:Array<{id:string;payload:unknown;provider_key:string}>}>("select workflow_claim_deliveries(true,'different@example.test','https://different.test') jobs")).rows[0].jobs.find(j=>j.id===first.id);
 expect(retry?.payload).toEqual(first.payload);expect(retry?.provider_key).toBe(first.provider_key);
 await db.query("update workflow_deliveries set first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 minute' where id=$1",[first.id]);
 await db.exec("select workflow_claim_deliveries(true,'sender@example.test','https://example.test')");
 expect((await db.query('select status from workflow_deliveries where id=$1',[first.id])).rows).toEqual([{status:'needs_review'}]);
});

it('uses calendar-day overdue/escalation boundaries and cancels resolved work',async()=>{
 const id=(await db.query<{id:string}>("insert into cards(board_id,column_id,title,position,created_by,assignee_id,due_date) values($1,$2,'Monday deadline',0,$3,$4,date_trunc('day',now())-interval '1 day') returning id",[board,'20000000-0000-4000-8000-000000000001',uid(1),uid(2)])).rows[0].id;
 await db.exec('select workflow_generate()');
 expect((await db.query('select type,recipient_id from notifications where card_id=$1 and type<>\'assignment\'',[id])).rows).toEqual([{type:'overdue',recipient_id:uid(2)}]);
 await db.query("update cards set due_date=date_trunc('day',now())-interval '2 days' where id=$1",[id]);
 await db.exec('select workflow_generate()');
 expect((await db.query("select recipient_id from notifications where card_id=$1 and type='escalation'",[id])).rows).toEqual([{recipient_id:uid(1)}]);
 await db.query("insert into columns(board_id,name,position) values($1,'Done',100)",[board]);
 await db.query("update cards set column_id=(select id from columns where board_id=$1 and name='Done') where id=$2",[board,id]);
 expect((await db.query("select workflow_notification_current(id) ok from notifications where card_id=$1 and type='escalation'",[id])).rows).toEqual([{ok:false}]);
});

it('protects owner settings and prevents legacy clients reaching directsend',async()=>{
 await expect(asUser(db,2,"select workflow_board_settings($1,'{\"action\":\"read\"}')",[board])).rejects.toThrow(/owner/);
 await expect(db.query("insert into notifications(recipient_id,actor_id,type,card_id,board_id,title) values($1,$2,'assignment',$3,$4,'Old client')",[uid(2),uid(1),card,board])).rejects.toThrow(/captured/);
 await expect(asUser(db,2,"update notifications set title='Forged' where recipient_id=auth.uid()")).rejects.toThrow(/permission/);
 await expect(asUser(db,1,"select workflow_emit('forged','assignment',$1,$2,array[$3::uuid],'Forged')",[card,uid(1),uid(2)])).rejects.toThrow(/permission/);
});

it('discards old assignment versions even after A to B to A reassignment',async()=>{
 await asUser(db,1,'update cards set assignee_id=$1 where id=$2',[uid(2),card]);
 const old=(await db.query<{id:string}>("select id from notifications where card_id=$1 and type='assignment' order by created_at desc limit 1",[card])).rows[0].id;
 await asUser(db,1,'update cards set assignee_id=null where id=$1',[card]);
 await asUser(db,1,'update cards set assignee_id=$1 where id=$2',[uid(2),card]);
 expect((await db.query('select workflow_notification_current($1) ok',[old])).rows).toEqual([{ok:false}]);
});


it('retries only definitive transient failures within the provider window',async()=>{
 const ids=(await db.query<{id:string}>("select id from workflow_deliveries where status='pending' limit 2")).rows.map(x=>x.id);
 await db.query("update workflow_deliveries set status='failed',attempts=6,first_attempt_at=now(),last_error='Temporary provider failure' where id=$1",[ids[0]]);
 await db.query("update workflow_deliveries set status='failed',attempts=2,first_attempt_at=now(),last_error='Provider acknowledgement uncertain' where id=$1",[ids[1]]);
 await asUser(db,1,"select workflow_board_settings($1,'{\"action\":\"retry_failed\"}')",[board]);
 expect((await db.query('select status,attempts from workflow_deliveries where id=$1',[ids[0]])).rows).toEqual([{status:'pending',attempts:0}]);
 expect((await db.query('select status from workflow_deliveries where id=$1',[ids[1]])).rows).toEqual([{status:'failed'}]);
});
it('includes overdue recipients when enabling scheduling after escalation day',async()=>{
 const id=(await db.query<{id:string}>("insert into cards(board_id,column_id,title,position,created_by,assignee_id,due_date) values($1,$2,'Late opt-in',0,$3,$4,date_trunc('day',now())-interval '3 days') returning id",[board,'20000000-0000-4000-8000-000000000001',uid(1),uid(2)])).rows[0].id;
 await db.exec('select workflow_generate()');
 expect((await db.query("select type from notifications where card_id=$1 and type in ('overdue','escalation') order by type",[id])).rows).toEqual([{type:'escalation'},{type:'overdue'}]);
});
it('discards stale review decisions while retaining invalidation and frozen deadline timezone',async()=>{
 await asUser(db,1,'update cards set assignee_id=$1 where id=$2',[uid(1),card]);
 await asUser(db,1,"select transition_card_approval($1,'configure',jsonb_build_object('operationId',gen_random_uuid(),'expectedRevision',1,'required',true,'reviewerId',$2::text))",[card,uid(2)]);
 const rev=(await db.query<{revision:number}>('select revision from card_approval_settings where card_id=$1',[card])).rows[0].revision;
 await asUser(db,1,"select transition_card_approval($1,'request',jsonb_build_object('operationId',gen_random_uuid(),'expectedRevision',$2::bigint,'reviewDueDate',((now() at time zone 'UTC')::date+1)::text))",[card,rev]);
 const request=(await db.query<{id:string}>('select id from approval_requests where card_id=$1 order by requested_at desc limit 1',[card])).rows[0].id;
 await asUser(db,1,"select workflow_board_settings($1,'{\"action\":\"save\",\"scheduling_enabled\":true,\"timezone\":\"Pacific/Kiritimati\"}')",[board]);
 expect((await db.query('select review_timezone from approval_requests where id=$1',[request])).rows).toEqual([{review_timezone:'UTC'}]);
 await asUser(db,2,"select transition_card_approval($1,'approve',jsonb_build_object('operationId',gen_random_uuid(),'expectedRevision',$2::bigint,'requestId',$3::text))",[card,rev,request]);
 expect((await db.query("select workflow_notification_current(id) ok from notifications where type='review_approved' and card_id=$1",[card])).rows).toEqual([{ok:true}]);
 await asUser(db,1,"update cards set title='Changed reviewed content' where id=$1",[card]);
 expect((await db.query("select workflow_notification_current(id) ok from notifications where type='review_approved' and card_id=$1",[card])).rows).toEqual([{ok:false}]);
 expect((await db.query("select workflow_notification_current(id) ok from notifications where type='review_invalidated' and card_id=$1",[card])).rows).toEqual([{ok:true}]);
});
it('cancels queued due-today mail after due date is moved forward',async()=>{
 const id=(await db.query<{id:string}>("insert into cards(board_id,column_id,title,position,created_by,assignee_id,due_date) values($1,$2,'Date changed',0,$3,$4,now()) returning id",[board,'20000000-0000-4000-8000-000000000001',uid(1),uid(2)])).rows[0].id;
 await db.exec('select workflow_generate()');
 const notification=(await db.query<{id:string}>("select id from notifications where card_id=$1 and type='due_today'",[id])).rows[0].id;
 await db.query("update cards set due_date=now()+interval '3 days' where id=$1",[id]);
 expect((await db.query('select workflow_notification_current($1) ok',[notification])).rows).toEqual([{ok:false}]);
});
it('rate-gates repeated public wakeups and rechecks recipient preferences after claim',async()=>{
 expect((await db.query('select workflow_begin_maintenance() ok')).rows).toEqual([{ok:true}]);
 expect((await db.query('select workflow_begin_maintenance() ok')).rows).toEqual([{ok:false}]);
 await expect(asUser(db,1,'select workflow_begin_maintenance()')).rejects.toThrow(/permission/);
 const jobs=(await db.query<{jobs:Array<{id:string;lease_token:string}>}>("select workflow_claim_deliveries(true,'sender@example.test','https://example.test') jobs")).rows[0].jobs;
 expect(jobs.length).toBeGreaterThan(0);
 const job=jobs[0];
 const recipient=(await db.query<{recipient_id:string}>('select n.recipient_id from workflow_deliveries d join notifications n on n.id=d.notification_id where d.id=$1',[job.id])).rows[0].recipient_id;
 await db.query('update profiles set email_notifications=false where id=$1',[recipient]);
 expect((await db.query('select workflow_validate_lease($1,$2) ok',[job.id,job.lease_token])).rows).toEqual([{ok:false}]);
 await db.query("select workflow_finish_delivery($1,$2,'accepted','wrong-ack')",[job.id,job.lease_token]);
 expect((await db.query('select status,provider_id from workflow_deliveries where id=$1',[job.id])).rows).toEqual([{status:'cancelled',provider_id:null}]);
});
it('does not spend delivery attempts on unused leases and counts an authorized dispatch only once',async()=>{
 await db.exec('update profiles set email_notifications=true');
 const first=(await db.query<{jobs:Array<{id:string;lease_token:string}>}>("select workflow_claim_deliveries(true,'sender@example.test','https://example.test') jobs")).rows[0].jobs[0];
 expect(first).toBeTruthy();
 for(let n=0;n<7;n++){
  await db.query("update workflow_deliveries set lease_until=now()-interval '1 minute' where id=$1",[first.id]);
  await db.exec("select workflow_claim_deliveries(true,'sender@example.test','https://example.test')");
 }
 expect((await db.query('select status,attempts,first_attempt_at from workflow_deliveries where id=$1',[first.id])).rows).toEqual([{status:'leased',attempts:0,first_attempt_at:null}]);
 const token=(await db.query<{lease_token:string}>('select lease_token from workflow_deliveries where id=$1',[first.id])).rows[0].lease_token;
 expect((await db.query('select workflow_validate_lease($1,$2) ok',[first.id,token])).rows).toEqual([{ok:true}]);
 await db.query('select workflow_validate_lease($1,$2)',[first.id,token]);
 expect((await db.query('select attempts,first_attempt_at is not null started from workflow_deliveries where id=$1',[first.id])).rows).toEqual([{attempts:1,started:true}]);
});
it('cancels obsolete due-today mail after local midnight without a task edit',async()=>{
 const id=(await db.query<{id:string}>("insert into cards(board_id,column_id,title,position,created_by,assignee_id,due_date) values($1,$2,'Midnight fixture',0,$3,$4,now()-interval '1 day') returning id",[board,'20000000-0000-4000-8000-000000000001',uid(1),uid(2)])).rows[0].id;
 await db.query("select workflow_emit('midnight-fixture','due_today',$1,null,array[$2::uuid],'Due today before midnight',null,jsonb_build_object('due_version',(select notification_due_version from cards where id=$1)))",[id,uid(2)]);
 const notification=(await db.query<{id:string}>("select id from notifications where event_key='midnight-fixture'")).rows[0].id;
 expect((await db.query('select workflow_notification_current($1) ok',[notification])).rows).toEqual([{ok:false}]);
});
