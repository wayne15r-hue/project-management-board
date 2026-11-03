import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => /^20261103_.*leave.*\.sql$/.test(name)).sort();
if (migrations.length < 2 || !migrations.includes('20261103_zzz_leave_references.sql')) throw new Error('Both core LeaveDesk and reference migrations must exist before preparation');
const bodies = migrations.map(name => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
  // The outer release transaction owns commit/rollback; never remove inner function BEGINs.
  if (!/^begin;\s*$/mi.test(sql) || !/^commit;\s*$/mi.test(sql)) throw new Error(`Expected explicit transaction in ${name}`);
  return `-- Source: ${name}\n${sql.replace(/^begin;\s*$/mi, '').replace(/^commit;\s*$/mi, '')}`;
});
const sql = `-- LeaveDesk preservation-aware release. Generated locally; not executed by this tool.
-- Requires privileged operator, restorable backup and brief maintenance window.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
create temp table leave_preservation(schema_name text,table_name text,row_count bigint,fingerprint text,primary key(schema_name,table_name)) on commit drop;
do $snapshot$
declare t record; n bigint; h text;
begin
 for t in select schemaname,tablename from pg_tables
  where schemaname in ('public','account_private')
    or (schemaname='storage' and tablename in ('objects','buckets'))
    or (schemaname='auth' and tablename='users')
  order by schemaname,tablename loop
  execute format('lock table %I.%I in share row exclusive mode',t.schemaname,t.tablename);
  execute format($q$select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) from %I.%I r$q$,t.schemaname,t.tablename) into n,h;
  insert into leave_preservation values(t.schemaname,t.tablename,n,h);
 end loop;
end $snapshot$;
${bodies.join('\n')}
do $preserve$
declare t record; n bigint; h text;
begin
 for t in select * from leave_preservation loop
  -- The only permitted mutation in an existing table is creation of the private leave-files bucket.
  if t.schema_name='storage' and t.table_name='buckets' then
   execute $q$select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) from storage.buckets r where id<>'leave-files'$q$ into n,h;
   if exists(select 1 from storage.buckets where id='leave-files' and public) then raise exception 'Leave file bucket must be private'; end if;
  else
   execute format($q$select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) from %I.%I r$q$,t.schema_name,t.table_name) into n,h;
  end if;
  if n<>t.row_count or h is distinct from t.fingerprint then raise exception 'Preservation failed for %.%; transaction aborted',t.schema_name,t.table_name; end if;
 end loop;
end $preserve$;
notify pgrst,'reload schema';
commit;
select jsonb_build_object('preserved',true,'reference_overlays',(select count(*) from public.leave_holidays where calendar_id is null),'company_days',(select count(*) from public.leave_holidays where kind='company')) as leave_rollout;
`;
// Refuse an already-provisioned bucket baseline: this first-rollout wrapper adds exactly one bucket.
const guarded = sql.replace('create temp table leave_preservation', `do $preflight$ begin if exists(select 1 from storage.buckets where id='leave-files') then raise exception 'leave-files already exists: inspect migration history and prepare an explicit upgrade wrapper'; end if; end $preflight$;\ncreate temp table leave_preservation`);
const output = path.resolve(root, '../admin-qa');
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'leave-production-release.sql'), guarded);
fs.writeFileSync(path.join(output, 'leave-production-release-manifest.json'), JSON.stringify({migrations,sha256:crypto.createHash('sha256').update(guarded).digest('hex'),bytes:Buffer.byteLength(guarded),executed:false}, null, 2)+'\n');
console.log(`Prepared ${migrations.length} migrations locally; SHA256 ${crypto.createHash('sha256').update(guarded).digest('hex')}. No database connection made.`);
