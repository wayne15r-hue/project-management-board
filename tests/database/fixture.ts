import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
export const uid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
export const board = "10000000-0000-4000-8000-000000000001";
export const card = "30000000-0000-4000-8000-000000000001";
export const column = "20000000-0000-4000-8000-000000000001";
export const conversation = "60000000-0000-4000-8000-000000000001";
export const team = "70000000-0000-4000-8000-000000000001";
const setup = `
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_user::text$$;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;

create role anon nologin;
create role service_role nologin bypassrls;
create schema realtime;
create table realtime.messages(id uuid primary key default gen_random_uuid(), topic text, extension text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
grant usage on schema realtime to authenticated,anon,service_role;
grant select,insert on realtime.messages to authenticated;
grant usage on schema public,auth,storage to authenticated,anon,service_role;
grant all on all tables in schema storage to authenticated,anon,service_role;
alter default privileges in schema public,storage grant all on tables to authenticated,anon,service_role;
create publication supabase_realtime;
`;
export async function database({policyOnly = false, seed = true, legacy = false} = {}) {
  const db = new PGlite();
  await db.exec(setup);
  if (legacy) await db.exec("set check_function_bodies=off");
  for (const name of fs.readdirSync(path.resolve("supabase/migrations")).sort()) {
    if (legacy && name.startsWith("202611")) continue;
    let sql = fs.readFileSync(path.resolve("supabase/migrations",name),"utf8");
    if (policyOnly) sql = sql.replace(/alter publication supabase_realtime add table [^;]+;/g, "");
    await db.exec(sql);
  }
  if (seed) await db.exec(`insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','owner@example.test'),
 ('00000000-0000-4000-8000-000000000002','other@example.test'),
 ('00000000-0000-4000-8000-000000000003','outsider@example.test');
insert into public.boards(id,name,owner_id) values
 ('10000000-0000-4000-8000-000000000001','Private board','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','Other board','00000000-0000-4000-8000-000000000002');
insert into public.columns(id,board_id,name,position) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','To Do',0),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other',0);
insert into public.cards(id,board_id,column_id,title,position,created_by) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Secret title',0,'00000000-0000-4000-8000-000000000001');
insert into public.labels(id,board_id,name) values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Private label');
insert into public.attachments(id,card_id,file_name,file_size,file_type,storage_path,uploaded_by) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','secret.txt',10,'text/plain','30000000-0000-4000-8000-000000000001/secret.txt','00000000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name) values ('attachments','30000000-0000-4000-8000-000000000001/secret.txt');
insert into public.conversations(id,type,created_by) values ('60000000-0000-4000-8000-000000000001','group','00000000-0000-4000-8000-000000000001');
insert into public.conversation_members(conversation_id,user_id,is_admin) values
 ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',true),
 ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',false);
insert into public.messages(conversation_id,sender_id,content) values ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Private message');
insert into storage.objects(bucket_id,name) values ('chat-files','60000000-0000-4000-8000-000000000001/private.txt');
insert into public.teams(id,name,created_by) values ('70000000-0000-4000-8000-000000000001','Private team','00000000-0000-4000-8000-000000000001');
insert into public.team_members(team_id,user_id,role) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','owner'),
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','member');
insert into public.board_teams(board_id,team_id) values ('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
insert into public.activity_log(id,card_id,actor_id,action,changes) values ('80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','commented','{"text":"Original"}');
update public.profiles set anthropic_api_key='dummy-audit-key-not-a-secret' where id='00000000-0000-4000-8000-000000000001';
insert into public.ai_usage(user_id,feature,model) values ('00000000-0000-4000-8000-000000000003','chat','dummy-audit-model');
`);
  return db;
}
export async function asUser(db: PGlite, user: number, sql: string, values: unknown[] = []) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid(user)}';`);
  try { return await db.query(sql,values); }
  finally { await db.exec("reset role"); }
}
