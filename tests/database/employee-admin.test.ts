import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { database, asUser, uid } from './fixture';
let db: PGlite;
let department: string;
beforeAll(async () => {
  db = await database();
  await db.exec("alter table auth.users add column email_confirmed_at timestamptz; update auth.users set email='omkar.bahirat1@proton.me',email_confirmed_at=now() where id='" + uid(1) + "'");
  department = (await db.query<{id:string}>("select id from employee_departments where name='IT'")).rows[0].id;
});
beforeEach(async () => {
  await db.exec('delete from employee_change_log; delete from employee_records; delete from employee_admin_members;');
  await db.query("insert into employee_admin_members(user_id,role) values($1,'owner')", [uid(1)]);
  await db.exec('update employee_departments set archived=false');
});
afterAll(async () => { await db?.close(); });
const submit = (user:number, manager:string|null=null) => asUser(db,user,'select employee_submit($1,$2,$3)',[department,'Engineer',manager]);
it('seeds the seven departments and replays without duplicating or overwriting them', async () => {
  await db.exec(fs.readFileSync('supabase/migrations/20261103_employee_admin.sql','utf8'));
  expect((await db.query('select * from employee_departments')).rows).toHaveLength(7);
});
it('bootstraps only a confirmed matching auth UUID, never an editable profile email', async () => {
  await db.exec('delete from employee_admin_members');
  await asUser(db,2,"update profiles set email='omkar.bahirat1@proton.me' where id=$1",[uid(2)]);
  await expect(db.query('select employee_bootstrap_owner($1)',[uid(2)])).rejects.toThrow(/verified/i);
  await expect(asUser(db,1,'select employee_bootstrap_owner($1)',[uid(1)])).rejects.toThrow(/permission denied/i);
  await db.query('select employee_bootstrap_owner($1)',[uid(1)]);
  await db.query('select employee_bootstrap_owner($1)',[uid(1)]);
  expect((await db.query('select * from employee_admin_members')).rows).toHaveLength(1);
});
it('allows one submission and denies overwrite or direct table writes', async () => {
  await submit(2);
  await expect(submit(2)).rejects.toThrow(/already completed/i);
  await expect(asUser(db,2,"update employee_records set job_title='CEO' where user_id=$1",[uid(2)])).rejects.toThrow(/permission denied/i);
  await expect(asUser(db,2,"insert into employee_admin_members(user_id,role) values($1,'admin')",[uid(2)])).rejects.toThrow(/permission denied/i);
});
it('keeps employee records private while allowing central admins to read them', async () => {
  await submit(2);
  expect((await asUser(db,3,'select * from employee_records')).rows).toHaveLength(0);
  expect((await asUser(db,2,'select * from employee_records')).rows).toHaveLength(1);
  expect((await asUser(db,1,'select * from employee_records')).rows).toHaveLength(1);
});
it('allows delegated employee edits but only the owner can manage admin membership', async () => {
  await submit(3);
  await asUser(db,1,'select employee_set_admin($1,true)',[uid(2)]);
  await asUser(db,2,'select employee_admin_save($1,$2,$3,$4)',[uid(3),department,'Analyst',null]);
  await expect(asUser(db,2,'select employee_set_admin($1,true)',[uid(3)])).rejects.toThrow(/owner/i);
  await expect(asUser(db,1,'select employee_set_admin($1,false)',[uid(1)])).rejects.toThrow(/owner/i);
  await asUser(db,1,'select employee_set_admin($1,false)',[uid(2)]);
  await expect(asUser(db,2,'select employee_admin_save($1,$2,$3,$4)',[uid(3),department,'Director',null])).rejects.toThrow(/admin/i);
});
it('requires each employee to submit their own initial setup, including when admins edit',async()=>{
  await expect(asUser(db,1,'select employee_admin_save($1,$2,$3,null)',[uid(3),department,'Analyst'])).rejects.toThrow(/complete.*setup/i);
  expect((await db.query('select * from employee_records')).rows).toHaveLength(0);
});
it('rejects self-reporting, cycles, nonexistent managers and empty or excessive titles', async () => {
  await expect(submit(2,uid(2))).rejects.toThrow(/report/i);
  await expect(submit(2,uid(9))).rejects.toThrow(/manager/i);
  await expect(asUser(db,2,'select employee_submit($1,$2,null)',[department,'   '])).rejects.toThrow(/title/i);
  await expect(asUser(db,2,'select employee_submit($1,$2,null)',[department,'x'.repeat(201)])).rejects.toThrow(/title/i);
  await submit(2,uid(3));
  await expect(submit(3,uid(2))).rejects.toThrow(/cycle/i);
});
it('allows admins to archive a department while preserving existing assignments', async () => {
  await submit(2);
  await asUser(db,1,'select employee_save_department($1,$2,true)',[department,'Technology']);
  await expect(submit(3)).rejects.toThrow(/department/i);
  await asUser(db,1,'select employee_admin_save($1,$2,$3,null)',[uid(2),department,'Senior Engineer']);
  expect((await asUser(db,2,'select department_id from employee_records')).rows[0]).toEqual({department_id:department});
  await expect(asUser(db,2,'select employee_save_department(null,$1,false)',['Random'])).rejects.toThrow(/admin/i);
});
it('logs employee, department and membership changes and denies forged history', async () => {
  await submit(2);
  await asUser(db,1,'select employee_set_admin($1,true)',[uid(3)]);
  await asUser(db,1,'select employee_save_department(null,$1,false)',['Legal']);
  expect((await asUser(db,1,'select * from employee_change_log')).rows).toHaveLength(3);
  expect((await asUser(db,2,'select * from employee_change_log')).rows).toHaveLength(0);
  await expect(asUser(db,2,"insert into employee_change_log(actor_id,action) values($1,'fake')",[uid(2)])).rejects.toThrow(/permission denied/i);
});
it('restricts directory and admin list but exposes only identity data in manager search',async()=>{
  await expect(asUser(db,2,"select employee_directory('',1)")).rejects.toThrow(/admin/i);
  await expect(asUser(db,2,'select employee_admin_list()')).rejects.toThrow(/admin/i);
  const directory=await asUser(db,1,"select employee_directory('',1) as value");
  expect((directory.rows[0] as {value:{total:number}}).value.total).toBe(3);
  const list=await asUser(db,1,'select employee_admin_list() as value');
  expect((list.rows[0] as {value:unknown[]}).value).toHaveLength(1);
  const search=await asUser(db,2,"select employee_manager_search('owner') as value");
  expect(Object.keys((search.rows[0] as {value:object[]}).value[0]).sort()).toEqual(['email','full_name','id']);
});
