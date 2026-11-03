import { afterEach, beforeEach, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { asUser, board, card, database, uid } from './fixture';

let db: PGlite;
const operation = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
beforeEach(async () => {
  db = await database();
  await db.query("insert into employee_admin_members(user_id,role) values($1,'owner')", [uid(1)]);
});
afterEach(async () => { await db?.close(); });
async function emit(key: string) {
  await db.query("select workflow_emit($1,'mention',$2,$3,$4,'Private board update','Private comment')", [key, card, uid(1), [uid(2)]]);
}
async function claim() {
  return (await db.query<{ jobs: { id: string; lease_token: string }[] }>("select workflow_claim_deliveries(true,'Helios <hello@example.test>','https://app.test') jobs")).rows[0].jobs;
}
async function deactivate() {
  await asUser(db, 1, "select account_request_action($1,'deactivate',$2,'{\"expectedRevision\":1}')", [uid(2), operation(1)]);
}
it('cancels pending and newly generated email to an inactive recipient despite retained work membership', async () => {
  await emit('before-deactivation');
  await deactivate();
  await emit('during-deactivation');
  expect((await db.query('select workflow_has_access($1,$2) access', [board, uid(2)])).rows[0]).toEqual({ access: true });
  expect(await claim()).toEqual([]);
  expect((await db.query('select status from workflow_deliveries order by id')).rows).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }]);
  expect((await db.query('select email_notifications from profiles where id=$1', [uid(2)])).rows[0]).toEqual({ email_notifications: true });
});
it('rejects a previously claimed delivery immediately before its provider call after deactivation', async () => {
  await emit('leased-before-deactivation');
  const [delivery] = await claim();
  expect(delivery).toBeTruthy();
  await deactivate();
  expect((await db.query('select workflow_validate_lease($1,$2) eligible', [delivery.id, delivery.lease_token])).rows[0]).toEqual({ eligible: false });
  expect((await db.query('select status from workflow_deliveries where id=$1', [delivery.id])).rows[0]).toEqual({ status: 'cancelled' });
});
it('restores new email eligibility after reactivation without regranting membership or preferences, including migration replay', async () => {
  await deactivate();
  const jobs = (await db.query<{ jobs: { id: string; lease_token: string }[] }>('select account_claim_operations() jobs')).rows[0].jobs;
  await db.query("select account_finish_operation($1,$2,'succeeded',null)", [jobs[0].id, jobs[0].lease_token]);
  await asUser(db, 1, "select account_request_action($1,'reactivate',$2,'{\"expectedRevision\":2}')", [uid(2), operation(2)]);
  const reactivation = (await db.query<{ jobs: { id: string; lease_token: string }[] }>('select account_claim_operations() jobs')).rows[0].jobs[0];
  await db.query("select account_finish_operation($1,$2,'succeeded',null)", [reactivation.id, reactivation.lease_token]);
  await db.exec(fs.readFileSync('supabase/migrations/20261103_z_account_management.sql', 'utf8'));
  await emit('after-reactivation');
  expect(await claim()).toHaveLength(1);
  expect((await db.query('select user_id from team_members where user_id=$1', [uid(2)])).rows).toHaveLength(1);
});
