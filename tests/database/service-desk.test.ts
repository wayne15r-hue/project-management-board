import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { asUser, database, uid, team, card } from './fixture';

let db: PGlite;
let seq = 1;
const op = () => `a0000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
async function create(user = 2, type = 'it_issue', operationId = op()) {
  const r = await asUser(db, user, 'select desk_create_ticket($1,$2::jsonb) as value', [team, JSON.stringify({ operationId, title: 'VPN unavailable', description: 'Cannot connect', type, priority: 'medium', fields: type === 'access_request' ? { system: 'Git', access_level: 'Write', reason: 'Development' } : { system: 'VPN', impact: 'Cannot work' } })]);
  return (r.rows[0] as {value:unknown}).value as { id: string; revision: number; status: string; approval_status: string };
}
async function act(id: string, user: number, action: string, payload: Record<string, unknown> = {}) {
  const r = await asUser(db, user, 'select desk_ticket_action($1,$2,$3::jsonb) as value', [id, action, JSON.stringify({ operationId: op(), expectedRevision: 1, ...payload })]);
  return (r.rows[0] as {value:unknown}).value as Record<string, unknown>;
}
describe('Service Desk database authority', () => {
  beforeEach(async () => {
    db = await database();
    await db.exec(`insert into auth.users(id,email) values ('${uid(4)}','reviewer@example.test'),('${uid(5)}','member@example.test'); insert into team_members(team_id,user_id,role) values ('${team}','${uid(4)}','member'),('${team}','${uid(5)}','member');`);
  });
  afterEach(async () => { await db.close(); });
  it('allows members to submit but denies outsiders and rejects missing request fields', async () => {
    expect((await create()).status).toBe('submitted');
    await expect(create(3)).rejects.toThrow(/member|access/i);
    await expect(asUser(db, 2, 'select desk_create_ticket($1,$2::jsonb)', [team, JSON.stringify({ operationId: op(), title: 'Access', description: 'Please', type: 'access_request', priority: 'high', fields: {} })])).rejects.toThrow(/system|access|field/i);
    await expect(asUser(db,2,'select desk_create_ticket($1,$2::jsonb)',[team,JSON.stringify({operationId:op(),title:'Invalid values',description:'Bad field objects',type:'it_issue',fields:{system:{nested:'invalid'},impact:true}})])).rejects.toThrow(/strings/i);
  });
  it('keeps requests private and prevents direct mutation or forged history', async () => {
    const t = await create();
    expect((await asUser(db, 5, 'select * from desk_tickets')).rows).toHaveLength(0);
    expect((await asUser(db, 1, 'select * from desk_tickets')).rows).toHaveLength(1);
    await expect(asUser(db, 2, "update desk_tickets set status='closed' where id=$1", [t.id])).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, 2, "insert into desk_activity(ticket_id,actor_id,action) values($1,$2,'approved')", [t.id, uid(2)])).rejects.toThrow(/permission denied/i);
  });
  it('restricts support-agent settings to admins and existing members', async () => {
    await expect(asUser(db, 2, 'select desk_set_agent($1,$2,true)', [team, uid(5)])).rejects.toThrow(/admin/i);
    await expect(asUser(db, 1, 'select desk_set_agent($1,$2,true)', [team, uid(3)])).rejects.toThrow(/member/i);
    await asUser(db, 1, 'select desk_set_agent($1,$2,true)', [team, uid(5)]);
    await create();
    expect((await asUser(db, 5, 'select * from desk_tickets')).rows).toHaveLength(1);
    await asUser(db, 1, 'select desk_set_agent($1,$2,false)', [team, uid(5)]);
    expect((await asUser(db, 5, 'select * from desk_tickets')).rows).toHaveLength(0);
  });
  it('deduplicates submissions and actions but rejects operation reuse with different content', async () => {
    const operationId = op(); const first = await create(2, 'it_issue', operationId);
    expect((await create(2, 'it_issue', operationId)).id).toBe(first.id);
    const actionId = op();
    await act(first.id, 1, 'status', { status: 'triage', operationId: actionId });
    await act(first.id, 1, 'status', { status: 'triage', operationId: actionId });
    await expect(act(first.id, 1, 'status', { status: 'cancelled', operationId: actionId })).rejects.toThrow(/operation|conflict/i);
    expect((await db.query('select * from desk_activity where action=\'status\'')).rows).toHaveLength(1);
  });
  it('gates fulfillment and exposes only assigned approvals', async () => {
    const t = await create(2, 'access_request');
    await act(t.id, 1, 'status', { status: 'triage' });
    await act(t.id, 1, 'assign', { assigneeId: uid(1) });
    await expect(act(t.id, 1, 'status', { status: 'in_progress' })).rejects.toThrow(/approval/i);
    await expect(act(t.id, 1, 'request_approval', { approverId: uid(2) })).rejects.toThrow(/independent/i);
    await expect(act(t.id, 1, 'request_approval', { approverId: uid(1) })).rejects.toThrow(/independent/i);
    await act(t.id, 1, 'request_approval', { approverId: uid(4) });
    expect((await asUser(db, 4, 'select * from desk_tickets')).rows).toHaveLength(1);
    await expect(act(t.id, 5, 'approve')).rejects.toThrow(/access|approver/i);
    await act(t.id, 4, 'approve');
    expect((await act(t.id, 1, 'status', { status: 'in_progress' })).status).toBe('in_progress');
    await expect(act(t.id, 1, 'status', { status: 'resolved' })).rejects.toThrow(/resolution/i);
    await act(t.id, 1, 'status', { status: 'resolved', note: 'Access provided' });
    expect((await act(t.id, 2, 'status', { status: 'closed' })).status).toBe('closed');
  });
  it('requires decision and waiting reasons, returns rejected requests to triage', async () => {
    const t = await create(2, 'access_request');
    await expect(act(t.id, 1, 'status', { status: 'waiting' })).rejects.toThrow(/reason/i);
    await act(t.id, 1, 'request_approval', { approverId: uid(4) });
    await expect(act(t.id, 4, 'reject')).rejects.toThrow(/reason/i);
    const r = await act(t.id, 4, 'reject', { note: 'Access level too broad' });
    expect(r).toMatchObject({ status: 'triage', approval_status: 'rejected' });
    await act(t.id, 1, 'assign', { assigneeId: uid(1) });
    await expect(act(t.id, 1, 'status', { status: 'in_progress' })).rejects.toThrow(/approval/i);
  });
  it('invalidates approvals on material edits and rejects stale revisions and late requester edits', async () => {
    const t = await create(2, 'access_request');
    await act(t.id, 1, 'request_approval', { approverId: uid(4) });
    await act(t.id, 4, 'approve');
    const changed = await act(t.id, 2, 'edit', { title: 'Changed access' });
    expect(changed).toMatchObject({ revision: 2, approval_status: 'not_requested' });
    await expect(act(t.id, 4, 'approve')).rejects.toThrow(/revision|pending/i);
    await act(t.id, 1, 'request_approval', { approverId: uid(4), expectedRevision: 2 });
    await act(t.id, 4, 'approve', { expectedRevision: 2 });
    await act(t.id, 1, 'assign', { assigneeId: uid(1), expectedRevision: 2 });
    await act(t.id, 1, 'status', { status: 'in_progress', expectedRevision: 2 });
    await expect(act(t.id, 2, 'edit', { title: 'Late change', expectedRevision: 2 })).rejects.toThrow(/triage|reopen/i);
  });
  it('revokes tickets, files and notification reads after membership removal', async () => {
    const t = await create();
    await act(t.id, 1, 'comment', { text: 'Please attach screenshot' });
    await db.query("insert into storage.objects(bucket_id,name) values('desk-attachments',$1)", [`${t.id}/test.txt`]);
    // No authenticated storage SELECT: otherwise clients could mint signed URLs
    // that outlive membership. Only the authorized server download proxy reads bytes.
    expect((await asUser(db, 2, "select * from storage.objects where bucket_id='desk-attachments'")).rows).toHaveLength(0);
    expect((await asUser(db, 2, 'select * from desk_notifications')).rows.length).toBeGreaterThan(0);
    await db.query('delete from team_members where team_id=$1 and user_id=$2', [team, uid(2)]);
    for (const table of ['desk_tickets', 'desk_activity', 'desk_notifications']) expect((await asUser(db, 2, `select * from ${table}`)).rows).toHaveLength(0);
    expect((await asUser(db, 2, "select * from storage.objects where bucket_id='desk-attachments'")).rows).toHaveLength(0);
    await expect(act(t.id, 2, 'comment', { text: 'Unauthorized' })).rejects.toThrow(/access/i);
  });
  it('requires return to triage before changing a request after work has begun, including while waiting', async () => {
    const t=await create();await act(t.id,1,'assign',{assigneeId:uid(1)});await act(t.id,1,'status',{status:'triage'});
    await act(t.id,1,'status',{status:'in_progress'});await act(t.id,1,'status',{status:'waiting',waitingReason:'requester_information',note:'Need details'});
    await expect(act(t.id,2,'edit',{title:'Late change while waiting'})).rejects.toThrow(/triage|reopen/i);
    const reopened=await act(t.id,1,'status',{status:'triage',note:'Revise scope'});
    expect(reopened.revision).toBe(2);
    await act(t.id,2,'edit',{title:'Revised scope',expectedRevision:2});
  });
  it('blocks fulfillment when an approver or assigned support agent is unavailable', async () => {
    const t = await create(2, 'access_request');
    await act(t.id, 1, 'assign', { assigneeId: uid(1) });
    await act(t.id, 1, 'request_approval', { approverId: uid(4) }); await act(t.id, 4, 'approve');
    await db.query('delete from team_members where team_id=$1 and user_id=$2', [team, uid(4)]);
    await expect(act(t.id, 1, 'status', { status: 'in_progress' })).rejects.toThrow(/approver|approval/i);
  });
  it('invalidates approval for attachments and replays committed uploads after fulfillment starts',async()=>{
    const t=await create(2,'access_request');await act(t.id,1,'request_approval',{approverId:uid(4)});await act(t.id,4,'approve');
    const path=`${t.id}/evidence.txt`;await db.query("insert into storage.objects(bucket_id,name) values('desk-attachments',$1)",[path]);
    const payload={operationId:op(),expectedRevision:1,storagePath:path,fileName:'evidence.txt',fileType:'text/plain',fileSize:20};
    const attached=await act(t.id,2,'attachment',payload);expect(attached).toMatchObject({revision:2,approval_status:'not_requested'});
    await act(t.id,1,'request_approval',{approverId:uid(4),expectedRevision:2});await act(t.id,4,'approve',{expectedRevision:2});
    await act(t.id,1,'assign',{assigneeId:uid(1),expectedRevision:2});await act(t.id,1,'status',{status:'in_progress',expectedRevision:2});
    const result=await asUser(db,2,'select desk_replay_attachment($1,$2::jsonb) as value',[t.id,JSON.stringify(payload)]);
    expect((result.rows[0] as {value:unknown}).value).toEqual(attached);
    expect((await db.query('select * from desk_attachments')).rows).toHaveLength(1);
    await expect(asUser(db,2,'select desk_replay_attachment($1,$2::jsonb)',[t.id,JSON.stringify({...payload,fileSize:21})])).rejects.toThrow(/conflict/i);
    await db.query('delete from team_members where team_id=$1 and user_id=$2',[team,uid(2)]);
    await expect(asUser(db,2,'select desk_replay_attachment($1,$2::jsonb)',[t.id,JSON.stringify(payload)])).rejects.toThrow(/access/i);
  });
  it('marks only the current recipient notifications read through the shared bell operation',async()=>{
    const t=await create();await act(t.id,1,'comment',{text:'Need screenshot'});await act(t.id,2,'comment',{text:'Here it is'});
    await asUser(db,2,'select desk_mark_all_notifications_read()');
    const counts=await db.query<{recipient_id:string;read:boolean}>('select recipient_id,read_at is not null as read from desk_notifications order by recipient_id');
    expect(counts.rows.some(n=>n.recipient_id===uid(2)&&n.read)).toBe(true);
    expect(counts.rows.some(n=>n.recipient_id===uid(1)&&n.read)).toBe(false);
  });
  it('validates task links against team and actor access', async () => {
    const t = await create();
    await act(t.id, 1, 'link', { cardId: card });
    expect((await asUser(db, 2, 'select * from desk_ticket_links')).rows).toHaveLength(1);
    await db.query('delete from board_teams where team_id=$1', [team]);
    await expect(act(t.id, 1, 'link', { cardId: card })).rejects.toThrow(/board|team/i);
  });
  it('preserves existing cards and ticket history on migration replay and transaction rollback', async () => {
    await create();
    const before = await db.query('select * from desk_tickets');
    const cards = await db.query('select * from cards order by id');
    const migration = fs.readFileSync('supabase/migrations/20261102_z_service_desk.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    expect((await db.query('select * from desk_tickets')).rows).toEqual(before.rows);
    await expect(db.exec(migration.replace(/commit;\s*$/i, 'select 1/0; commit;'))).rejects.toThrow(/division by zero/);
    await db.exec('rollback');
    expect((await db.query('select * from cards order by id')).rows).toEqual(cards.rows);
  });
});
