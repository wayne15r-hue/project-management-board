import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20261103_z_account_management.sql','utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const snapshot=`do $snapshot$
declare t record; n bigint; h text; schema_name text;
begin
 for t in select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='storage' and tablename='objects') or (schemaname='auth' and tablename='users') order by schemaname,tablename loop
  execute format('lock table %I.%I in share row exclusive mode',t.schemaname,t.tablename);
  execute format($q$select count(*),md5(coalesce(string_agg((to_jsonb(r)-%L)::text,'|' order by (to_jsonb(r)-%L)::text),'')) from %I.%I r$q$,
   case when t.schemaname='public' and t.tablename='profiles' then 'auth_user_id' else '__no_column__' end,
   case when t.schemaname='public' and t.tablename='profiles' then 'auth_user_id' else '__no_column__' end,t.schemaname,t.tablename) into n,h;
  insert into account_preservation values(t.schemaname,t.tablename,n,h);
 end loop;
end $snapshot$;`;
const verify=`do $verify$
declare t record; n bigint; h text;
begin
 for t in select * from account_preservation loop
  execute format($q$select count(*),md5(coalesce(string_agg((to_jsonb(r)-%L)::text,'|' order by (to_jsonb(r)-%L)::text),'')) from %I.%I r$q$,
   case when t.schema_name='public' and t.table_name='profiles' then 'auth_user_id' else '__no_column__' end,
   case when t.schema_name='public' and t.table_name='profiles' then 'auth_user_id' else '__no_column__' end,t.schema_name,t.table_name) into n,h;
  if n<>t.row_count or h is distinct from t.fingerprint then raise exception 'Preservation failed for %.%',t.schema_name,t.table_name;end if;
 end loop;
 if exists(select from profiles p where p.auth_user_id is distinct from p.id and exists(select from auth.users u where u.id=p.id)) then raise exception 'Active Auth association changed';end if;
 if not exists(select from employee_admin_members where user_id='e53212ba-857d-4f05-817d-1b4d43562a96' and role='owner') then raise exception 'Protected owner membership missing';end if;
end $verify$;`;
const sql=`-- Approved account lifecycle rollout; no account actions or provider calls.
begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
create temp table account_preservation(schema_name text,table_name text,row_count bigint,fingerprint text,primary key(schema_name,table_name)) on commit drop;
${snapshot}
${migration}
${verify}
commit;
select jsonb_build_object('preserved',true,'accounts',(select count(*) from account_private.accounts),'owner',(select user_id from employee_admin_members where role='owner'),'pending_operations',(select count(*) from account_private.operations)) as account_rollout;
`;
fs.mkdirSync('../admin-qa',{recursive:true});
fs.writeFileSync('../admin-qa/account-production-release.sql',sql);
// Compact transfer removes only whole-line comments and whitespace; the reviewed SQL stays above.
const compact=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join(' ').replace(/\s+/g,' ').trim();
fs.writeFileSync('../admin-qa/account-production-compact.sql',compact);
let checksum=2166136261;
for(const character of compact)checksum=Math.imul(checksum^character.charCodeAt(0),16777619)>>>0;
console.log('Compact transfer:',compact.length,'characters; FNV32:',checksum);
console.log('Prepared preservation-checked account release:',sql.length,'characters');
