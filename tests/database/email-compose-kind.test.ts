import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { asUser, database, uid } from "./fixture";

const migration = "20261115_email_compose_kind.sql";

it("preserves drafts across migration and persists compose kinds alongside legacy writes", async () => {
  const db = await database({ policyOnly: true, beforeMigration: migration });
  const legacy = "ea000000-0000-4000-8000-000000000001";
  const fresh = "ea000000-0000-4000-8000-000000000002";
  const recipients = JSON.stringify([{ id: uid(2), kind: "to" }]);
  const originalSave = "select email_save_draft($1,$2,'Saved subject','Saved body',$3) as value";
  const typedSave = "select email_save_draft($1,$2,'Saved subject','Saved body',$3,$4) as value";
  const getDraft = "select email_get_draft($1) as value";
  const migrationSql = readFileSync(`supabase/migrations/${migration}`, "utf8");
  try {
    await db.exec("update email_private.settings set mode='all'");
    await db.exec("update profiles set full_name = 'Employee ' || right(id::text, 1)");
    await db.exec("alter table employee_records disable trigger user");
    await db.exec("insert into employee_departments(name) values('Mail QA')");
    await db.exec("insert into employee_records(user_id,department_id,job_title,updated_by,completed_at) select p.id,d.id,'Test',p.id,now() from profiles p cross join employee_departments d where d.name='Mail QA'");
    await db.exec("alter table employee_records enable trigger user");
    await asUser(db, 1, originalSave, [legacy, 0, recipients]);
    await db.exec(migrationSql);
    expect((await asUser(db, 1, getDraft, [legacy])).rows).toMatchObject([
      { value: { composeKind: null, version: 1, subject: "Saved subject", body: "Saved body" } },
    ]);

    await expect(asUser(db, 1, typedSave, [fresh, 0, recipients, "other"])).rejects.toThrow(/compose/i);
    await asUser(db, 1, typedSave, [fresh, 0, recipients, "reply"]);
    await asUser(db, 1, originalSave, [fresh, 1, recipients]);
    await db.exec(migrationSql);
    await expect(asUser(db, 2, typedSave, [fresh, 2, recipients, "forward"])).rejects.toThrow(/changed elsewhere/i);
    await db.exec("set role anon");
    await expect(db.query(typedSave, [fresh, 2, recipients, "forward"])).rejects.toThrow(/permission denied/i);
    await db.exec("reset role");
    expect((await asUser(db, 1, getDraft, [fresh])).rows).toMatchObject([
      { value: { composeKind: "reply", version: 2, recipients: [{ id: uid(2), kind: "to" }] } },
    ]);
  } finally {
    await db.close();
  }
});
