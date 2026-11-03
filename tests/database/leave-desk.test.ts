import {beforeEach,afterEach,it,expect} from 'vitest';
import fs from 'node:fs';
import type {PGlite} from '@electric-sql/pglite';
import {database,asUser,uid} from './fixture';
type Request={id:string;revision:number;status:string};
type Balance={pending:number;remaining:number;used:number;booked:number;period_start:string;allowance:number};
let db:PGlite, seq=1;
const key=()=>`a0000000-0000-4000-8000-${String(seq++).padStart(12,'0')}`;
async function q<T>(user:number,sql:string,args:unknown[]=[]):Promise<T>{return ((await asUser(db,user,sql,args)).rows[0] as {v:T}).v;}
async function setting(kind:string,payload:unknown){return q<{id:string}>(1,'select leave_settings($1,$2::jsonb,$3) v',[kind,JSON.stringify(payload),key()]);}
let type:string,policy:string,calendar:string;
beforeEach(async()=>{
 db=await database();
 await db.exec(`insert into employee_admin_members values('${uid(1)}','owner',now()); insert into employee_records(user_id,department_id,job_title,manager_id,updated_by) select '${uid(2)}',id,'Agent','${uid(3)}','${uid(1)}' from employee_departments limit 1;`);
 type=(await setting('type',{name:'Annual'})).id;
 policy=(await setting('policy',{name:'Policy',year_start:1,allowances:[{type_id:type,days:20,paid:true,tracked:true}]})).id;
 calendar=(await setting('calendar',{name:'Office',timezone:'Asia/Calcutta',weekdays:[1,2,3,4,5]})).id;
 await setting('assignment',{user_id:uid(2),policy_id:policy,calendar_id:calendar,opening_balances:[{type_id:type,period_start:'2027-01-01',days:10}],reason:'Reviewed opening'});
});
afterEach(async()=>{await db?.close();});
async function submit(start='2027-01-04',end=start,half='full',k=key()){return q<Request>(2,'select leave_submit($1::jsonb,$2) v',[JSON.stringify({type_id:type,start_date:start,end_date:end,half,reason:'Private medical detail'}),k]);}
async function action(r:Request,user:number,a:string,payload:Record<string,unknown>={reason:'Reviewed'},k=key()){return q<Request>(user,'select leave_action($1,$2,$3,$4::jsonb,$5) v',[r.id,r.revision,a,JSON.stringify(payload),k]);}
const balances=()=>q<Balance[]>(2,'select leave_balances() v');
it('reserves, converts once, and retains booking until cancellation accepted',async()=>{
 let r=await submit();expect((await balances())[0]).toMatchObject({pending:1,remaining:9});
 const k=key();const approved=await action(r,3,'approve',{reason:'Reviewed'},k);expect((await action(r,3,'approve',{reason:'Reviewed'},k)).id).toBe(r.id);r=approved;
 expect((await balances())[0]).toMatchObject({pending:0,remaining:9});r=await action(r,2,'cancel');expect((await balances())[0].remaining).toBe(9);await action(r,3,'accept_cancel');expect((await balances())[0].remaining).toBe(10);
});
it('rechecks managers, requires explicit takeover, and keeps coworker calendar generic',async()=>{
 let r=await submit();await expect(action(r,1,'approve')).rejects.toThrow(/takeover/i);
 expect((await asUser(db,3,'select * from leave_requests')).rows).toHaveLength(1);
 await db.query('update employee_records set manager_id=$1 where user_id=$2',[uid(1),uid(2)]);
 expect((await asUser(db,3,'select * from leave_requests')).rows).toHaveLength(0);await expect(action(r,3,'approve')).rejects.toThrow(/access|reviewer/i);r=await action(r,1,'approve');expect(r.status).toBe('approved');
 const dept=(await db.query<{department_id:string}>('select department_id from employee_records where user_id=$1',[uid(2)])).rows[0].department_id;
 await db.query('insert into employee_records(user_id,department_id,job_title,updated_by) values($1,$2,$3,$4)',[uid(3),dept,'Peer',uid(1)]);
 const c=await q<{events:unknown[]}>(3,"select leave_calendar('2027-01-01','2027-01-31',$1) v",[dept]);expect(c.events).toHaveLength(1);expect(JSON.stringify(c)).not.toContain('medical');
});
it('allows complementary halves, rejects overlapping reservations and insufficient balances',async()=>{
 const k=key(),a=await submit('2027-01-04','2027-01-04','first',k);expect((await submit('2027-01-04','2027-01-04','first',k)).id).toBe(a.id);
 await expect(submit('2027-01-05','2027-01-05','first',k)).rejects.toThrow(/conflict/i);await submit('2027-01-04','2027-01-04','second');await expect(submit()).rejects.toThrow(/overlap/i);await expect(submit('2027-02-01','2027-02-26')).rejects.toThrow(/balance/i);
});
it('keeps snapshots, denies direct writes, revokes inactive users',async()=>{
 const r=await submit();await db.query('update leave_calendars set weekdays=array[7] where id=$1',[calendar]);expect((await db.query('select * from leave_days where request_id=$1',[r.id])).rows).toHaveLength(1);
 await expect(asUser(db,2,"update leave_requests set status='approved'")).rejects.toThrow(/permission/i);await db.query("update account_private.accounts set status='deactivated' where id=$1",[uid(2)]);await expect(q(2,'select leave_detail($1) v',[r.id])).rejects.toThrow(/inactive|access/i);expect((await asUser(db,2,'select * from leave_requests')).rows).toHaveLength(0);
});
it('denies self approval including admin; eligible admins may take over with reason and revoke old manager',async()=>{
 let r=await submit();await expect(action(r,2,'approve')).rejects.toThrow(/reviewer|independent/i);await expect(action(r,1,'takeover',{reason:''})).rejects.toThrow(/reason/i);
 r=await action(r,1,'takeover');expect((await asUser(db,3,'select * from leave_requests')).rows).toHaveLength(0);expect((await asUser(db,3,'select * from leave_notifications')).rows).toHaveLength(0);await expect(action(r,3,'approve')).rejects.toThrow(/access/i);await action(r,1,'approve');
 await db.query("insert into employee_admin_members(user_id,role) values($1,'admin')",[uid(2)]);const self=await submit('2027-01-05');await expect(action(self,2,'approve')).rejects.toThrow(/reviewer|independent/i);
});
it('falls back to independent admin when manager is unavailable and holds without independent reviewer',async()=>{
 await db.query('update employee_records set manager_id=null where user_id=$1',[uid(2)]);const r=await submit();expect((await action(r,1,'approve')).status).toBe('approved');
 await db.query('delete from employee_admin_members');const held=await submit('2027-01-05');await expect(action(held,2,'approve')).rejects.toThrow(/reviewer|independent/i);await expect(action(held,3,'approve')).rejects.toThrow(/access/i);
});
it('releases changed/declined reservations and requires fresh resubmission snapshot and stale checks',async()=>{
 let r=await submit();await expect(action(r,3,'changes',{reason:''})).rejects.toThrow(/reason/i);const original=r;r=await action(r,3,'changes');expect((await balances())[0].remaining).toBe(10);
 await expect(action(original,2,'resubmit')).rejects.toThrow(/revision/i);r=await action(r,2,'resubmit',{start_date:'2027-01-05',end_date:'2027-01-05',reason:'Amended'});expect((await balances())[0].remaining).toBe(9);
 expect((await db.query<{date:string}>('select date::text from leave_days where request_id=$1',[r.id])).rows[0].date).toBe('2027-01-05');await action(r,3,'decline');expect((await balances())[0].remaining).toBe(10);
});
it('splits January and April periods, granting only later configured fixed allowances',async()=>{
 await submit('2027-12-31','2028-01-03');let b=await balances();expect(b.find(x=>x.period_start==='2027-01-01')).toMatchObject({remaining:9});expect(b.find(x=>x.period_start==='2028-01-01')).toMatchObject({allowance:20,remaining:19});
 const april=await setting('policy',{name:'April',year_start:4,allowances:[{type_id:type,days:12,paid:true,tracked:true}]});
 await setting('assignment',{user_id:uid(2),policy_id:april.id,calendar_id:calendar,opening_balances:[{type_id:type,period_start:'2027-04-01',days:6}],reason:'April opening confirmed'});
 await submit('2028-03-31','2028-04-03');b=await balances();expect(b.find(x=>x.period_start==='2027-04-01')).toMatchObject({remaining:5});expect(b.find(x=>x.period_start==='2028-04-01')).toMatchObject({allowance:12,remaining:11});
});
it('deducts observed company holidays only and respects assigned working weekdays',async()=>{
 await setting('holiday',{calendar_id:calendar,date:'2027-01-04',name:'Company observed',kind:'company',source:'Admin reviewed',review_status:'reviewed'});
 await setting('holiday',{date:'2027-01-05',name:'Overlay',kind:'india_restricted',source:'Reference',review_status:'reviewed'});
 const r=await submit('2027-01-04','2027-01-06');expect((await db.query('select * from leave_days where request_id=$1',[r.id])).rows).toHaveLength(2);
 await setting('calendar',{id:calendar,name:'Sunday',timezone:'America/New_York',weekdays:[7]});const sun=await submit('2027-01-10');expect((await db.query('select * from leave_days where request_id=$1',[sun.id])).rows).toHaveLength(1);
});
it('keeps file metadata private, validates content retries, and disallows signed URL access',async()=>{
 const r=await submit(),id=key(),path=`${r.id}/${id}`,payload={id,name:'medical.pdf',path,mime:'application/pdf',size:20,sha256:'a'.repeat(64)};
 await db.query("insert into storage.objects(bucket_id,name) values('leave-files',$1)",[path]);const f=await q<{id:string}>(2,'select leave_register_file($1,$2::jsonb) v',[r.id,JSON.stringify(payload)]);expect(f.id).toBe(id);
 await expect(q(2,'select leave_register_file($1,$2::jsonb) v',[r.id,JSON.stringify({...payload,sha256:'b'.repeat(64)})])).rejects.toThrow(/conflict/i);
 expect((await asUser(db,2,"select * from storage.objects where bucket_id='leave-files'")).rows).toHaveLength(0);await db.query('update employee_records set manager_id=$1 where user_id=$2',[uid(1),uid(2)]);expect((await asUser(db,3,'select * from leave_files')).rows).toHaveLength(0);
 await expect(asUser(db,3,"insert into storage.objects(bucket_id,name) values('leave-files',$1)",[`${r.id}/${key()}`])).rejects.toThrow(/policy|access/i);
});
it('records and corrects private NCNS, employee explains; conversion links approved leave without another deduction',async()=>{
 const incident=async(user:number,payload:unknown)=>q<Request>(user,'select leave_incident($1::jsonb,$2) v',[JSON.stringify(payload),key()]);
 let i=await incident(3,{action:'record',user_id:uid(2),date:'2027-01-04',expected_period:'Full day',reason:'No notice'});expect((await q<unknown[]>(1,'select leave_incidents() v'))).toHaveLength(1);
 i=await incident(2,{id:i.id,revision:i.revision,action:'explain',reason:'Medical emergency'});i=await incident(3,{id:i.id,revision:i.revision,action:'correct',date:'2027-01-05',reason:'Correct date'});
 let r=await submit('2027-01-05');r=await action(r,3,'approve');const before=(await balances())[0].remaining;await incident(3,{id:i.id,revision:i.revision,action:'convert',request_id:r.id,reason:'Approved leave'});expect((await balances())[0].remaining).toBe(before);
 await db.query('update employee_records set manager_id=$1 where user_id=$2',[uid(1),uid(2)]);expect(await q<unknown[]>(3,'select leave_incidents() v')).toHaveLength(0);
});
it('replays additive migration without replacing configured data or changing historical bookings',async()=>{
 const r=await submit();const before=(await db.query('select * from leave_ledger')).rows;await db.exec(fs.readFileSync('supabase/migrations/20261103_zz_leave_desk.sql','utf8'));expect((await db.query('select * from leave_ledger')).rows).toEqual(before);expect((await q<Request>(2,'select leave_detail($1)->\'request\' v',[r.id])).id).toBe(r.id);
});

it('denies ordinary coworker NCNS writes for managerless targets instead of NULL-bypassing authorization',async()=>{
 await db.query('update employee_records set manager_id=null where user_id=$1',[uid(2)]);
 await expect(q(3,'select leave_incident($1::jsonb,$2) v',[JSON.stringify({user_id:uid(2),date:'2027-01-04',expected_period:'Full day',action:'record',reason:'Forged'}),key()])).rejects.toThrow(/manager|admin/i);
 expect((await db.query('select * from leave_incident_records')).rows).toHaveLength(0);
});
it('uses real Storage foldername semantics and protects inserted objects from direct mutation',async()=>{
 await db.exec("create or replace function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;");
 const r=await submit(),path=`${r.id}/${key()}`;
 await asUser(db,2,"insert into storage.objects(bucket_id,name) values('leave-files',$1)",[path]);
 expect((await db.query("select name from storage.objects where bucket_id='leave-files'")).rows).toHaveLength(1);
 await asUser(db,2,"delete from storage.objects where bucket_id='leave-files'");expect((await db.query("select name from storage.objects where bucket_id='leave-files'")).rows).toHaveLength(1);
});
it('withdraws a changes-requested application without releasing its already restored balance twice',async()=>{
 let r=await submit();r=await action(r,3,'changes');expect((await balances())[0].remaining).toBe(10);await action(r,2,'withdraw');expect((await balances())[0].remaining).toBe(10);
});
it('requires initial opening confirmation and validates policy flags and finite half-day amounts',async()=>{
 await expect(setting('policy',{name:'Bad',year_start:1,allowances:[{type_id:type,days:10,paid:true}]})).rejects.toThrow(/allowance/i);
 await expect(setting('policy',{name:'Bad',year_start:1,allowances:[{type_id:type,days:'NaN',paid:true,tracked:true}]})).rejects.toThrow(/allowance/i);
 await expect(setting('adjustment',{user_id:uid(2),type_id:type,period_start:'2027-01-01',days:0.1,reason:'Bad fraction'})).rejects.toThrow(/adjustment/i);
});
it('does not disclose managerless employee balances or guessed NCNS identifiers',async()=>{
 const i=await q<Request>(3,'select leave_incident($1::jsonb,$2) v',[JSON.stringify({user_id:uid(2),date:'2027-01-04',expected_period:'Day',action:'record',reason:'Recorded'}),key()]);
 await db.query('update employee_records set manager_id=null where user_id=$1',[uid(2)]);
 await expect(q(3,'select leave_balances($1) v',[uid(2)])).rejects.toThrow(/access/i);
 await expect(q(3,'select leave_incident($1::jsonb,$2) v',[JSON.stringify({id:i.id,revision:i.revision,action:'dismiss',reason:'Unauthorized'}),key()])).rejects.toThrow(/access/i);
});
it('shows handover deadline warnings only where the current viewer has existing task access',async()=>{
 const r=await submit();await db.query("update cards set assignee_id=$1,due_date='2027-01-04T12:00:00Z'",[uid(2)]);
 const detail=()=>q<{task_warnings:unknown[]}>(3,'select leave_detail($1) v',[r.id]);expect((await detail()).task_warnings).toEqual([]);
 expect((await q<{task_warnings:unknown[]}>(1,'select leave_detail($1) v',[r.id])).task_warnings).toHaveLength(1);
});
it('preserves leave history and ledger when an independent employee Auth account is permanently removed',async()=>{
 await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;alter table storage.objects add column owner uuid references auth.users,add column owner_id text;insert into auth.users(id,email) values('${uid(4)}','leave-only@example.test');insert into employee_records(user_id,department_id,job_title,manager_id,updated_by) select '${uid(4)}',id,'Employee','${uid(3)}','${uid(1)}' from employee_departments limit 1;`);
 await setting('assignment',{user_id:uid(4),policy_id:policy,calendar_id:calendar,opening_balances:[{type_id:type,period_start:'2027-01-01',days:10}],reason:'Opening reviewed'});
 const r=await q<Request>(4,'select leave_submit($1::jsonb,$2) v',[JSON.stringify({type_id:type,start_date:'2027-01-04',end_date:'2027-01-04',half:'full'}),key()]);await action(r,3,'approve');
 const op=key();await q(1,'select account_request_action($1,$2,$3,$4::jsonb) v',[uid(4),'deactivate',op,JSON.stringify({expectedRevision:1})]);
 const claim=async(id:string)=>{const rows=await db.query<{jobs:{id:string;lease_token:string}[]}>('select account_claim_operations() jobs');return rows.rows[0].jobs.find(j=>j.id===id)!.lease_token;};
 await db.query("select account_finish_operation($1,$2,'succeeded',null)",[op,await claim(op)]);
 const preview=await q<{revision:number;confirmationEmail:string;blockers:string[]}>(1,'select account_deletion_preview($1) v',[uid(4)]);expect(preview.blockers).toEqual([]);
 const del=key();await q(1,'select account_request_action($1,$2,$3,$4::jsonb) v',[uid(4),'delete',del,JSON.stringify({expectedRevision:preview.revision,confirmationEmail:preview.confirmationEmail,transfers:{}})]);
 await db.query('select account_prepare_delete($1,$2)',[del,await claim(del)]);await db.query('delete from auth.users where id=$1',[uid(4)]);
 expect((await db.query('select * from leave_requests where id=$1',[r.id])).rows).toHaveLength(1);expect((await db.query('select * from leave_ledger where user_id=$1',[uid(4)])).rows.length).toBeGreaterThan(0);
 expect((await q<{request:Request}>(1,'select leave_detail($1) v',[r.id])).request.status).toBe('approved');await expect(q(4,'select leave_detail($1) v',[r.id])).rejects.toThrow(/access|inactive/i);
});
it('supports entirely untracked unpaid policies without invented openings and still reports day totals',async()=>{
 const unpaid=await setting('type',{name:'Untracked unpaid'});const pol=await setting('policy',{name:'Unpaid only',year_start:1,allowances:[{type_id:unpaid.id,days:0,paid:false,tracked:false}]});
 await db.exec(`insert into auth.users(id,email) values('${uid(4)}','unpaid@example.test');insert into employee_records(user_id,department_id,job_title,manager_id,updated_by) select '${uid(4)}',id,'Employee','${uid(3)}','${uid(1)}' from employee_departments limit 1;`);
 await setting('assignment',{user_id:uid(4),policy_id:pol.id,calendar_id:calendar,opening_balances:[],reason:'Unpaid assignment'});
 const r=await q<Request>(4,'select leave_submit($1::jsonb,$2) v',[JSON.stringify({type_id:unpaid.id,start_date:'2027-01-04',end_date:'2027-01-04',half:'full'}),key()]);expect((await q<Balance[]>(4,'select leave_balances() v'))[0]).toMatchObject({pending:1,remaining:0,tracked:false});await action(r,3,'approve');expect((await q<Balance[]>(4,'select leave_balances() v'))[0]).toMatchObject({pending:0,booked:1,remaining:0});expect((await db.query('select * from leave_ledger where user_id=$1',[uid(4)])).rows).toHaveLength(0);
});
it('exposes editable holiday and assignment settings only to admins, with safe insight and calendar totals',async()=>{
 await setting('holiday',{calendar_id:calendar,date:'2027-01-04',name:'Company day',kind:'company',source:'HR',review_status:'reviewed'});
 const context=await q<{holidays:{id:string;calendar_id:string|null}[];assignments:unknown[]}>(1,'select leave_context() v');expect(context.holidays.length).toBeGreaterThan(0);expect(context.assignments).toHaveLength(1);
 const ordinary=await q<{holidays:unknown[];assignments:unknown[]}>(2,'select leave_context() v');expect(ordinary.holidays).toEqual([]);expect(ordinary.assignments).toEqual([]);
 await setting('holiday',{id:context.holidays.find(h=>h.calendar_id===calendar)?.id,calendar_id:calendar,date:'2027-01-04',name:'Corrected day',kind:'company',source:'HR reviewed',review_status:'reviewed'});
 const r=await submit('2027-01-05');await action(r,3,'approve');const insights=await q<{monthly:{days:number}[];pending_count:number}>(3,'select leave_insights() v');expect(insights.monthly[0].days).toBe(1);expect(insights.pending_count).toBe(0);
});
it('retains overlap protection while cancellation waits for review and requires past-date explanations',async()=>{
 let r=await submit();r=await action(r,3,'approve');r=await action(r,2,'cancel');await expect(submit()).rejects.toThrow(/overlap/i);r=await action(r,3,'reject_cancel');expect(r.status).toBe('approved');await expect(submit('2000-01-03')).rejects.toThrow(/explanation/i);
});


it('counts one person away for complementary approved halves on their local current day',async()=>{
 await setting('calendar',{id:calendar,name:'All days',timezone:'Asia/Calcutta',weekdays:[1,2,3,4,5,6,7]});
 const today=(await db.query<{today:string;period:string}>("select (now() at time zone 'Asia/Calcutta')::date::text today,leave_period((now() at time zone 'Asia/Calcutta')::date,1)::text period")).rows[0];
 await db.query("insert into leave_ledger(user_id,type_id,period_start,kind,amount,actor_id,reason) select $1,$2,$3::date,'opening',10,$4,'Reviewed test opening' where not exists(select from leave_ledger where user_id=$1 and type_id=$2 and period_start=$3::date and kind in('opening','allowance'))",[uid(2),type,today.period,uid(1)]);
 const first=await submit(today.today,today.today,'first'),second=await submit(today.today,today.today,'second');await action(first,3,'approve');await action(second,3,'approve');
 const insights=await q<{people_away:{user_id:string}[]}>(3,'select leave_insights() v');expect(insights.people_away).toHaveLength(1);expect(insights.people_away[0].user_id).toBe(uid(2));
});
it('projects the current later-period fixed allowance before submission without a read-side ledger write',async()=>{
 const dates=(await db.query<{today:string;period:string;previous:string}>("select (now() at time zone 'Asia/Calcutta')::date::text today,leave_period((now() at time zone 'Asia/Calcutta')::date,1)::text period,(leave_period((now() at time zone 'Asia/Calcutta')::date,1)-interval '1 year')::date::text previous")).rows[0];
 await db.query('delete from leave_ledger where user_id=$1 and type_id=$2',[uid(2),type]);await setting('assignment',{user_id:uid(2),policy_id:policy,calendar_id:calendar,opening_balances:[{type_id:type,period_start:dates.previous,days:3}],reason:'Prior confirmed opening'});
 const before=(await db.query('select * from leave_ledger order by id')).rows;
 expect((await balances()).find(b=>b.period_start===dates.period)).toMatchObject({allowance:20,remaining:20,pending:0});expect((await db.query('select * from leave_ledger order by id')).rows).toEqual(before);
 await setting('calendar',{id:calendar,name:'All days',timezone:'Asia/Calcutta',weekdays:[1,2,3,4,5,6,7]});await submit(dates.today);
 expect((await balances()).find(b=>b.period_start===dates.period)).toMatchObject({allowance:20,remaining:19,pending:1});
});
it('does not project a fixed allowance before any confirmed opening for that type',async()=>{
 await db.query('delete from leave_ledger where user_id=$1 and type_id=$2',[uid(2),type]);expect(await balances()).toEqual([]);
});
