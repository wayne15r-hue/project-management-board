import { afterAll, beforeAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, database, uid } from "./fixture";

let db: PGlite;
beforeAll(async () => {
  db = await database({ policyOnly: true });
  for (let i = 4; i <= 5; i++) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [uid(i), "employee" + i + "@example.test"]);
  }
  await db.exec("update profiles set full_name = 'Employee ' || right(id::text, 1)");
  // Isolate the mail policy from the unrelated employee-setup workflow.
  await db.exec("alter table employee_records disable trigger user");
  await db.exec("insert into employee_departments(name) values('Mail QA')");
  await db.exec("insert into employee_records(user_id,department_id,job_title,updated_by,completed_at) select p.id,d.id,'Test',p.id,now() from profiles p cross join employee_departments d where d.name='Mail QA'");
  await db.exec("alter table employee_records enable trigger user");
});
afterAll(async () => { await db?.close(); });

const draft = "10000000-1000-4000-8000-000000000001";
const inactiveDraft = "10000000-1000-4000-8000-000000000002";
const file = "10000000-1000-4000-8000-000000000003";
const call = async <T>(user: number, sql: string, args: unknown[] = []) => {
  const result = await asUser(db, user, sql, args);
  return (result.rows[0] as { value: T })?.value;
};
const save = (id: string, version: number, recipients: { id: string; kind: string }[]) =>
  call<{ version: number }>(1, "select email_save_draft($1,$2,'Roadmap','The confidential milestone.',$3) as value", [id, version, JSON.stringify(recipients)]);
const list = (user: number, folder: string, query = "") =>
  call<{ items: { id: string }[] }>(user, "select email_list($1,$2,false,0) as value", [folder, query]);

it("keeps mail off by default and limits direct RPCs to the pilot", async () => {
  expect(await call(1, "select email_enabled() as value")).toBe(false);
  await expect(list(1, "inbox")).rejects.toThrow(/unavailable/i);
  await db.exec("update email_private.settings set mode='pilot'");
  await db.query("insert into email_private.pilot_users values ($1),($2),($3),($4)", [uid(1), uid(2), uid(3), uid(4)]);
  expect(await call(1, "select email_enabled() as value")).toBe(true);
  await expect(list(5, "inbox")).rejects.toThrow(/unavailable/i);
  await expect(asUser(db, 1, "select * from email_private.messages")).rejects.toThrow(/permission denied/i);
  expect(await call(1, "select email_directory('Employee 2') as value")).toEqual([{ id: uid(2), name: "Employee 2" }]);
  expect(await call(1, "select email_directory('other@example.test') as value")).toEqual([{ id: uid(2), name: "Employee 2", email: "other@example.test" }]);
});

it("sends once, keeps Bcc scoped, and keeps copies and unread counts independent", async () => {
  const recipients = [{ id: uid(2), kind: "to" }, { id: uid(3), kind: "bcc" }, { id: uid(4), kind: "bcc" }];
  expect((await save(draft, 0, recipients)).version).toBe(1);
  await expect(save(draft, 0, recipients)).rejects.toThrow(/changed elsewhere/i);
  const sent = await call(1, "select email_send($1,1) as value", [draft]);
  expect(await call(1, "select email_send($1,1) as value", [draft])).toEqual(sent);
  expect((await list(1, "sent")).items).toHaveLength(1);
  const entry = (await list(2, "inbox", "milestone")).items[0];
  const bcc = (await list(3, "inbox")).items[0];
  const details = (user: number, id: string) => call<{ recipients: { id: string }[]; isBcc: boolean }>(user, "select email_detail($1) as value", [id]);
  expect((await details(2, entry.id)).recipients.map(({ id }) => id)).toEqual([uid(2)]);
  expect((await details(3, bcc.id)).recipients.map(({ id }) => id)).toEqual([uid(2), uid(3)]);
  expect((await details(3, bcc.id)).isBcc).toBe(true);
  await expect(details(4, entry.id)).rejects.toThrow(/not found/i);
  expect(await call(2, "select email_unread_count() as value")).toBe(0);
  expect(await call(4, "select email_unread_count() as value")).toBe(1);
  await call(2, "select email_mailbox_action($1,'unread') as value", [entry.id]);
  await call(2, "select email_mailbox_action($1,'trash') as value", [entry.id]);
  expect((await list(2, "trash")).items).toHaveLength(1);
  expect(await call(2, "select email_unread_count() as value")).toBe(0);
  await call(2, "select email_mailbox_action($1,'restore') as value", [entry.id]);
  expect(await call(2, "select email_unread_count() as value")).toBe(1);
});

it("preserves drafts when an address becomes inactive and rolls back pilot access without data loss", async () => {
  await save(inactiveDraft, 0, [{ id: uid(2), kind: "to" }]);
  await db.query("update account_private.accounts set status='deactivated' where id=$1", [uid(2)]);
  await expect(call(1, "select email_send($1,1) as value", [inactiveDraft])).rejects.toThrow(/recipient/i);
  expect((await list(1, "drafts")).items).toEqual([expect.objectContaining({ id: inactiveDraft })]);
  await expect(list(2, "inbox")).rejects.toThrow(/unavailable/i);
  await db.exec("update email_private.settings set mode='off'");
  await expect(list(1, "sent")).rejects.toThrow(/unavailable/i);
  await db.exec("update email_private.settings set mode='all'");
  expect((await list(1, "sent")).items).toHaveLength(1);
});

it("reserves quota durably and only lets the service finalize and reclaim uploads", async () => {
  await expect(call(1, "select email_reserve_upload($1,$2,'file.pdf','application/pdf',1,$3,1) as value", [inactiveDraft, file, uid(1)])).rejects.toThrow(/permission denied/i);
  await db.query("select email_reserve_upload($1,$2,'file.pdf','application/pdf',1,$3,1)", [inactiveDraft, file, uid(1)]);
  await expect(call(1, "select email_send($1,1) as value", [inactiveDraft])).rejects.toThrow();
  await db.query("update email_private.files set created_at=now()-interval '25 hours' where id=$1", [file]);
  const first = await db.query("select email_claim_cleanup() as value");
  expect(first.rows).toEqual([{ value: { jobs: [{ id: file, path: file }], purged: 1 } }]);
  expect((await db.query("select email_claim_cleanup() as value")).rows).toEqual([{ value: { jobs: [], purged: 0 } }]);
  await db.query("select email_finish_cleanup($1,false)", [file]);
  await db.query("update email_private.files set cleanup_after=now() where id=$1", [file]);
  expect((await db.query("select email_claim_cleanup() as value")).rows).toEqual([{ value: { jobs: [{ id: file, path: file }], purged: 0 } }]);
  await db.query("select email_finish_cleanup($1,true)", [file]);
  expect((await db.query("select id from email_private.files where id=$1", [file])).rows).toEqual([]);
});


it("reports a batch of expired text-only mail so maintenance can drain the rest", async () => {
  await db.query("insert into email_private.messages(sender_id,subject,body,sent_at) select $1,'Expired','',now() from generate_series(1,101)", [uid(1)]);
  await db.query("insert into email_private.entries(user_id,message_id,direction,folder,prior_folder,trashed_at,is_read,sent_at) select $1,id,'sent','trash','sent',now()-interval '31 days',true,sent_at from email_private.messages where subject='Expired'", [uid(1)]);
  expect((await db.query("select email_claim_cleanup() as value")).rows).toEqual([{ value: { jobs: [], purged: 200 } }]);
  expect((await db.query("select email_claim_cleanup() as value")).rows).toEqual([{ value: { jobs: [], purged: 2 } }]);
});

it("prevents sending attachment changes from a stale tab", async () => {
  const currentDraft = "10000000-1000-4000-8000-000000000004";
  await save(currentDraft, 0, [{ id: uid(3), kind: "to" }]);
  await db.query("select email_reserve_upload($1,$2,'file.pdf','application/pdf',2,$3,1)", [currentDraft, file, uid(1)]);
  await db.query("select email_finish_upload($1,$2,$3,true,1)", [currentDraft, file, uid(1)]);
  await expect(call(1, "select email_send($1,1) as value", [currentDraft])).rejects.toThrow(/changed elsewhere/i);
  expect(await call(1, "select email_send($1,2) as value", [currentDraft])).toMatchObject({ id: expect.any(String) });
});


it("enforces rolling send limits without losing the draft", async () => {
  const limited = "10000000-1000-4000-8000-000000000005";
  await save(limited, 0, [{ id: uid(3), kind: "to" }]);
  await db.query("insert into email_private.sends(user_id,draft_id,entry_id,sent_at) select $1,gen_random_uuid(),gen_random_uuid(),now() from generate_series(1,50)", [uid(1)]);
  await expect(call(1, "select email_send($1,1) as value", [limited])).rejects.toThrow(/send limit/i);
  expect(await call(1, "select email_get_draft($1) as value", [limited])).toMatchObject({ version: 1 });
  await db.query("update email_private.sends set sent_at=now()-interval '2 hours' where user_id=$1", [uid(1)]);
  expect(await call(1, "select email_send($1,1) as value", [limited])).toMatchObject({ id: expect.any(String) });
});

it("shares forwarded files by reference and preserves them after the source is purged", async () => {
  const sourceEntry = (await asUser(db, 3, "select email_list('inbox','',false,0) as value")).rows[0] as { value: { items: { id: string }[] } };
  const source = sourceEntry.value.items[1].id;
  const target = "10000000-1000-4000-8000-000000000006";
  await call(3, "select email_save_draft($1,0,'Forwarded','', $2) as value", [target, JSON.stringify([{ id: uid(4), kind: "to" }])]);
  const forwarded = await call<{ version: number; attachments: { id: string }[] }>(
    3, "select email_forward_files($1,$2,1) as value", [target, source],
  );
  expect(forwarded.version).toBe(2);
  expect(forwarded.attachments).toHaveLength(1);
  await expect(call(4, "select email_attachment_access($1) as value", [forwarded.attachments[0].id])).rejects.toThrow(/not found/i);
  await call(3, "select email_send($1,2) as value", [target]);
  await db.query("update email_private.entries set folder='trash',prior_folder=direction,trashed_at=now()-interval '31 days' where message_id=(select message_id from email_private.entries where id=$1)", [source]);
  await db.query("select email_claim_cleanup()");
  expect(await call(4, "select email_attachment_access($1) as value", [forwarded.attachments[0].id])).toMatchObject({ path: file });
  expect((await db.query("select id from email_private.files where id=$1", [file])).rows).toHaveLength(1);
});

it("charges pending and saved uploads toward the uploader quota", async () => {
  const quotaDraft = "10000000-1000-4000-8000-000000000007";
  await save(quotaDraft, 0, []);
  await db.query("insert into email_private.files(id,uploader_id,name,mime,bytes) select gen_random_uuid(),$1,'file.pdf','application/pdf',3000000 from generate_series(1,33)", [uid(1)]);
  await expect(db.query("select email_reserve_upload($1,gen_random_uuid(),'large.pdf','application/pdf',2000000,$2,1)", [quotaDraft, uid(1)])).rejects.toThrow(/quota/i);
});
