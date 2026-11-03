import fs from 'node:fs';
const body=fs.readFileSync('supabase/migrations/20261103_employee_admin.sql','utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const owner='e53212ba-857d-4f05-817d-1b4d43562a96';
const script=`-- Approved Helios employee-administration rollout, 2026-11-03.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
create temp table employee_preservation(table_name text primary key,row_count bigint,fingerprint text) on commit drop;
do $snapshot$
declare t record; n bigint; h text;
begin
 for t in select tablename from pg_tables where schemaname='public' and left(tablename,9)<>'employee_' order by tablename loop
  execute format('lock table public.%I in share row exclusive mode',t.tablename);
  execute format($q$select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) from public.%I r$q$,t.tablename) into n,h;
  insert into employee_preservation values(t.tablename,n,h);
 end loop;
end $snapshot$;
${body}
do $owner$
begin
 if (select count(*) from auth.users where lower(email)='omkar.bahirat1@proton.me' and email_confirmed_at is not null)<>1 then raise exception 'Expected exactly one verified owner'; end if;
 perform public.employee_bootstrap_owner('${owner}');
end $owner$;
do $preserve$
declare t record; n bigint; h text;
begin
 for t in select * from employee_preservation loop
  execute format($q$select count(*),md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) from public.%I r$q$,t.table_name) into n,h;
  if n<>t.row_count or h is distinct from t.fingerprint then raise exception 'Existing table % changed; rolling back',t.table_name; end if;
 end loop;
end $preserve$;
notify pgrst,'reload schema';
commit;
select jsonb_build_object('owner',(select jsonb_build_object('user_id',user_id,'role',role) from public.employee_admin_members where user_id='${owner}'),
 'departments',(select count(*) from public.employee_departments),'cards',(select count(*) from public.cards),
 'card_fingerprint',(select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from public.cards c),
 'audit_events',(select count(*) from public.employee_change_log)) as employee_rollout;
`;
fs.writeFileSync('../admin-qa/production-release.sql',script);
console.log('Prepared preservation-checked employee release:',script.length,'characters');
