begin;
-- Keep application history keyed to profiles. Only the nullable association represents login.
alter table public.profiles drop constraint if exists profiles_id_fkey,
 add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
update public.profiles set auth_user_id=id where auth_user_id is null and exists(select from auth.users u where u.id=profiles.id);
alter table public.profiles drop constraint if exists account_profile_auth_identity, add constraint account_profile_auth_identity check (auth_user_id is null or auth_user_id=id);
alter table public.employee_change_log drop constraint employee_change_log_actor_id_fkey,
 add foreign key(actor_id) references public.profiles;
alter table public.employee_records drop constraint employee_records_updated_by_fkey,
 add foreign key(updated_by) references public.profiles;

create schema if not exists account_private;
revoke all on schema account_private from public,anon,authenticated,service_role;
create table if not exists account_private.accounts (
 id uuid primary key references public.profiles,
 status text not null default 'active' check(status in ('active','deactivated','deleting','deleted')),
 revision integer not null default 1,
 former_admin boolean not null default false
);
insert into account_private.accounts(id,former_admin)
 select p.id,exists(select from public.employee_admin_members m where m.user_id=p.id)
 or exists(select from public.employee_change_log l where l.subject_id=p.id and l.action in ('admin_granted','admin_revoked'))
 from public.profiles p on conflict(id) do nothing;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into profiles(id,auth_user_id,full_name,email) values(new.id,new.id,new.raw_user_meta_data->>'full_name',new.email);
 insert into account_private.accounts(id) values(new.id);
 return new;
end $$;

create table if not exists account_private.directory (
 id uuid primary key references public.profiles, employee_id text check(length(employee_id) between 1 and 100),
 work_location text check(length(work_location) between 1 and 200), joining_date date,
 employment_type text check(employment_type in ('Full-time','Part-time','Contract','Intern','Temporary','Other'))
);
create table if not exists account_private.operations (
 id uuid primary key, actor_id uuid not null references public.profiles, target_id uuid not null references public.profiles,
 action text not null check(action in ('reset_password','deactivate','reactivate','delete')),
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed','ambiguous')),
 payload jsonb not null, attempts int not null default 0, last_error text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 available_at timestamptz not null default clock_timestamp(), lease_token uuid, lease_until timestamptz,
 prepared boolean not null default false, revision integer not null
);
create unique index if not exists account_employee_id_unique on account_private.directory(lower(employee_id)) where employee_id is not null;
alter table account_private.operations add column if not exists provider_attempted boolean not null default false;
create unique index if not exists account_one_operation on account_private.operations(target_id) where status in ('pending','running');
create index if not exists account_claim_due on account_private.operations(available_at) where status in ('pending','running');
create table if not exists account_private.audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles,
 target_id uuid not null references public.profiles, action text not null,outcome text not null, created_at timestamptz default clock_timestamp()
);
create table if not exists account_private.media (
 operation_id uuid not null references account_private.operations,cleanup_id uuid not null,primary key(operation_id,cleanup_id)
);
create table if not exists account_private.runtime(singleton boolean primary key default true check(singleton),last_run timestamptz);
insert into account_private.runtime(singleton) values(true) on conflict do nothing;
create or replace function public.account_begin_maintenance() returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update account_private.runtime set last_run=clock_timestamp() where singleton and (last_run is null or last_run<clock_timestamp()-interval '10 seconds');
 return found;
end $$;
create or replace function public.account_is_active() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select from account_private.accounts where id=auth.uid() and status='active')
$$;
revoke all on function public.account_is_active() from public,anon;
grant execute on function public.account_is_active() to authenticated;

-- RLS covers PostgREST, Storage and Realtime, but not TRUNCATE or privileged RPCs.
do $$ declare r record;
begin
 for r in select c.oid::regclass tbl from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and ((n.nspname='public') or (n.nspname='realtime' and c.relname='messages')
    or (n.nspname='storage' and c.relname='objects')) loop
  execute format('revoke truncate,references,trigger on %s from public,anon,authenticated',r.tbl);
  execute format('drop policy if exists account_active_session on %s',r.tbl);
  execute format('create policy account_active_session on %s as restrictive for all to authenticated using ((select public.account_is_active())) with check ((select public.account_is_active()))',r.tbl);
 end loop;
end $$;

-- Keep existing function OIDs, signatures, argument defaults, result sets and policy bindings.
-- Only public RPCs with definer privileges need a guarded trampoline; the original bodies
-- live in an unexposed schema. Internal service calls without an end-user JWT remain valid.
do $$ declare f record; call_args text; invocation text; guard text; body text;
begin
 for f in select p.*,pg_get_function_arguments(p.oid) args,pg_get_function_result(p.oid) result_type,
  pg_get_functiondef(p.oid) ddl from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
  and p.prorettype<>'trigger'::regtype and p.proname not like 'account\_%' escape '\' and p.proname<>'delete_conversation' and p.prosrc not like '%begin if (auth.uid() is not null or current_setting(%' and not exists(select from pg_depend dep where dep.classid='pg_proc'::regclass and dep.objid=p.oid and dep.deptype='e') and has_function_privilege('authenticated',p.oid,'execute')
 loop
  execute replace(f.ddl,'FUNCTION public.'||quote_ident(f.proname)||'(','FUNCTION account_private.'||quote_ident(f.proname)||'(');
  select coalesce(string_agg('$'||i,',' order by i),'') into call_args from generate_series(1,f.pronargs) i;
  invocation:=format('account_private.%I(%s)',f.proname,call_args);
  guard:='if (auth.uid() is not null or current_setting(''role'',true) in (''anon'',''authenticated'')) and not public.account_is_active() then ';
  guard:=guard||case when f.prorettype='boolean'::regtype then 'return false;' else 'raise exception ''Account inactive'' using errcode=''42501'';' end||' end if; ';
  body:='begin '||guard||case when f.proretset then 'return query select * from '||invocation||';'
   when f.prorettype='void'::regtype then 'perform '||invocation||'; return;'
   else 'return '||invocation||';' end||' end';
  execute format('create or replace function public.%I(%s) returns %s language plpgsql %s security definer set search_path=public,pg_temp as %L',
   f.proname,f.args,f.result_type,case f.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end,body);
 end loop;
end $$;

-- Keep the conversation lock ahead of all authorization reads, as required by group management.
create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform from conversations where id=p_conversation_id for update;
 if not public.account_is_active() or not exists(select from conversation_members where conversation_id=p_conversation_id and user_id=auth.uid() and is_admin) then
  raise exception 'Only active admins can delete conversations' using errcode='42501'; end if;
 delete from conversations where id=p_conversation_id;
 return true;
end $$;

create or replace function account_private.admin_actor() returns uuid language plpgsql stable as $$
begin
 if not public.account_is_active() or not exists(select from public.employee_admin_members where user_id=auth.uid()) then
  raise exception 'Active admin required' using errcode='42501'; end if;
 return auth.uid();
end $$;
create or replace function account_private.remember_admin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select from account_private.accounts where id=new.user_id and status='active') then
  raise exception 'Admin must be active' using errcode='22023'; end if;
 update account_private.accounts set former_admin=true where id=new.user_id;
 return new;
end $$;
drop trigger if exists account_admin_membership on public.employee_admin_members;
create trigger account_admin_membership before insert or update on public.employee_admin_members
 for each row execute function account_private.remember_admin();
create or replace function account_private.directory_fields(p_user uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('employeeId',d.employee_id,'workLocation',d.work_location,'joiningDate',d.joining_date,'employmentType',d.employment_type)
 from (values(p_user)) u(id) left join account_private.directory d using(id)
$$;
create or replace function public.account_own_directory() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.account_is_active() then raise exception 'Account inactive' using errcode='42501'; end if;
 return account_private.directory_fields(auth.uid());
end $$;
create or replace function public.account_save_directory(p_user uuid,p_fields jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid;
begin
 update employee_runtime set revision=revision+1 where singleton;
 actor:=account_private.admin_actor();
 if not exists(select from account_private.accounts where id=p_user and status in ('active','deactivated')) then raise exception 'Account unavailable' using errcode='22023'; end if;
 if jsonb_typeof(p_fields) is distinct from 'object' or exists(select from jsonb_each(p_fields) where key not in ('employeeId','workLocation','joiningDate','employmentType') or jsonb_typeof(value) not in ('null','string')) then raise exception 'Invalid directory fields' using errcode='22023'; end if;
 insert into account_private.directory values(p_user,nullif(trim(p_fields->>'employeeId'),''),nullif(trim(p_fields->>'workLocation'),''),
  nullif(p_fields->>'joiningDate','')::date,nullif(p_fields->>'employmentType',''))
 on conflict(id) do update set employee_id=excluded.employee_id,work_location=excluded.work_location,joining_date=excluded.joining_date,employment_type=excluded.employment_type;
 insert into account_private.audit(actor_id,target_id,action,outcome) values(actor,p_user,'directory_updated','succeeded');
 return account_private.directory_fields(p_user);
end $$;

create or replace function public.account_directory(p_filters jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare page_num integer:=greatest(1,least(coalesce((p_filters->>'page')::integer,1),1000000)); result jsonb;
begin
 perform account_private.admin_actor();
 with data as (
 select p.id,coalesce(u.email,p.email) email,p.full_name,r,d.name department,
 case when m.id is not null then jsonb_build_object('id',m.id,'email',m.email,'full_name',m.full_name) end manager,
 a.role,account_private.directory_fields(p.id) directory,
 jsonb_build_object('status',s.status,'revision',s.revision,'formerAdmin',s.former_admin,'createdAt',coalesce(to_jsonb(u)->>'created_at',p.created_at::text),
 'lastSignInAt',to_jsonb(u)->>'last_sign_in_at','emailVerified',(to_jsonb(u)->>'email_confirmed_at') is not null) account,
 (select to_jsonb(o)-array['lease_token','lease_until','payload','prepared','available_at','revision']||jsonb_build_object('payload','{}'::jsonb)
 from account_private.operations o where o.target_id=p.id order by o.created_at desc limit 1) latest
 from profiles p join account_private.accounts s on s.id=p.id left join auth.users u on u.id=p.auth_user_id
 left join employee_records r on r.user_id=p.id left join employee_departments d on d.id=r.department_id
 left join profiles m on m.id=r.manager_id left join employee_admin_members a on a.user_id=p.id left join account_private.directory e on e.id=p.id
 where (coalesce(p_filters->>'status','') in ('','all') or p_filters->>'status'=s.status)
 and (coalesce(p_filters->>'department','') in ('','all') or p_filters->>'department'=r.department_id::text)
 and (coalesce(p_filters->>'manager','') in ('','all') or p_filters->>'manager'=r.manager_id::text)
 and (coalesce(p_filters->>'role','') in ('','all') or p_filters->>'role'=coalesce(a.role,'employee'))
 and (coalesce(p_filters->>'setup','') in ('','all') or p_filters->>'setup'=case when r.user_id is null then 'incomplete' else 'complete' end)
 and concat_ws(' ',p.full_name,coalesce(u.email,p.email),e.employee_id,e.work_location,r.job_title,d.name) ilike '%'||left(coalesce(p_filters->>'q',''),100)||'%'
 ), paged as (select * from data order by coalesce(full_name,email),id limit 25 offset ((page_num-1)*25))
 select jsonb_build_object('total',(select count(*) from data),'page',page_num,'items',coalesce((select jsonb_agg(
 jsonb_build_object('id',id,'full_name',full_name,'email',email,'record',to_jsonb(r),'department',department,
 'manager',manager,'adminRole',role,'account',account,'directory',directory,'latestOperation',latest) order by coalesce(full_name,email),id) from paged),'[]')) into result;
 return result;
end $$;
create or replace function public.account_audit(p_query text,p_page integer) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare page_num integer:=greatest(1,least(coalesce(p_page,1),1000000)); result jsonb;
begin
 perform account_private.admin_actor();
 with events as (
 select id,actor_id,target_id,action,outcome,created_at from account_private.audit
 union all select id,actor_id,subject_id,action,'succeeded',created_at from employee_change_log
 ), data as (select e.id,coalesce(a.full_name,a.email) actor,coalesce(t.full_name,t.email,d.name,'Organization') target,e.action,e.outcome,e.created_at
 from events e join profiles a on a.id=e.actor_id left join profiles t on t.id=e.target_id left join employee_departments d on d.id=e.target_id
 where concat_ws(' ',a.full_name,a.email,t.full_name,t.email,d.name,e.action,e.outcome) ilike '%'||left(coalesce(p_query,''),100)||'%'),
 paged as (select * from data order by created_at desc,id limit 25 offset ((page_num-1)*25))
 select jsonb_build_object('total',(select count(*) from data),'page',page_num,'items',coalesce((select jsonb_agg(
 (to_jsonb(paged)-'created_at')||jsonb_build_object('createdAt',created_at) order by created_at desc,id) from paged),'[]')) into result;
 return result;
end $$;

-- Each private scope is represented by its opaque ID and generic label only.
-- Completed assignments/decisions stay with their historical profile.
create or replace function account_private.requirements(p_target uuid)
returns table(key text,kind text,label text,n integer,allow_none boolean,candidates jsonb)
language sql stable set search_path=public,pg_temp as $$
 with recursive descendants(id) as (
 select user_id from employee_records where manager_id=p_target
 union select r.user_id from employee_records r join descendants d on d.id=r.manager_id
 ), scopes(code,object_id,scope,scope_id,label,n,allow_none,exclude_one,exclude_two) as (
 select 'board',id,'board',id,'Board ownership',1,false,null::uuid,null::uuid from boards where owner_id=p_target
 union all select 'team',t.id,'team',t.id,'Team ownership',1,false,null,null from teams t where t.created_by=p_target
 or exists(select from team_members m where m.team_id=t.id and m.user_id=p_target and m.role='owner')
 union all select 'group',c.id,'group',c.id,'Group administration',1,false,null,null from conversations c
 where c.type='group' and exists(select from conversation_members m where m.conversation_id=c.id and m.user_id=p_target and m.is_admin)
 and not exists(select from conversation_members m join account_private.accounts a on a.id=m.user_id and a.status='active'
 where m.conversation_id=c.id and m.user_id<>p_target and m.is_admin)
 union all select 'card',c.id,'board',c.board_id,'Open board assignment',1,true,s.reviewer_id,null from cards c
 left join card_approval_settings s on s.card_id=c.id where c.assignee_id=p_target and not approval_column_complete(c.column_id)
 union all select 'review',c.id,'board',c.board_id,'Board approval reviewer',1,false,c.assignee_id,r.requester_id
 from cards c join card_approval_settings s on s.card_id=c.id left join approval_requests r on r.card_id=c.id and r.status='pending'
 where s.required and s.reviewer_id=p_target and not approval_column_complete(c.column_id)
 union all select 'ticket',id,'support',team_id,'Open ticket assignment',1,true,approver_id,null from desk_tickets
 where assignee_id=p_target and status not in ('resolved','closed','cancelled')
 union all select 'approver',id,'team',team_id,'Ticket approver',1,false,assignee_id,requester_id from desk_tickets
 where approver_id=p_target and status not in ('resolved','closed','cancelled')
 union all select 'manager',p_target,'directory',p_target,'Direct reports',count(*)::int,true,null,null from employee_records where manager_id=p_target having count(*)>0
 union all select 'file',o.id,
 case o.bucket_id when 'attachments' then 'board' when 'chat-files' then 'group' when 'desk-attachments' then 'deskfile' else 'unknown' end,
 case o.bucket_id when 'attachments' then (select c.board_id from cards c where c.id::text=split_part(o.name,'/',1))
 when 'chat-files' then (select c.id from conversations c where c.id::text=split_part(o.name,'/',1))
 when 'desk-attachments' then (select t.id from desk_tickets t where t.id::text=split_part(o.name,'/',1)) end,
 'Shared file ownership',1,false,null,null from storage.objects o where not(o.bucket_id='avatars' and split_part(o.name,'/',1)=p_target::text)
 and (to_jsonb(o)->>'owner'=p_target::text or to_jsonb(o)->>'owner_id'=p_target::text)
 )
 select code||':'||object_id,case code when 'card' then 'assignment' when 'ticket' then 'assignment' when 'review' then 'approval'
 when 'approver' then 'approval' when 'file' then 'storage' else code end,label,n,allow_none,
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email) order by coalesce(p.full_name,p.email),p.id)
 from profiles p join account_private.accounts a on a.id=p.id where a.status='active' and p.id<>p_target
 and p.id is distinct from exclude_one and p.id is distinct from exclude_two
 and case scope when 'board' then workflow_has_access(scope_id,p.id)
 when 'team' then exists(select from team_members m where m.team_id=scope_id and m.user_id=p.id)
 when 'support' then desk_is_support(scope_id,p.id) when 'deskfile' then desk_can_read(scope_id,p.id)
 when 'group' then exists(select from conversation_members m where m.conversation_id=scope_id and m.user_id=p.id)
 when 'directory' then not exists(select from descendants d where d.id=p.id) else false end),'[]'::jsonb)
 from scopes order by code,object_id
$$;
create or replace function account_private.authorized(p_actor uuid,p_target uuid,p_action text) returns boolean language sql stable as $$
 select exists(select from public.employee_admin_members a join account_private.accounts actor on actor.id=a.user_id and actor.status='active'
 join account_private.accounts t on t.id=p_target left join public.employee_admin_members m on m.user_id=t.id
 where a.user_id=p_actor and (p_action not in ('deactivate','delete') or
  (t.id<>a.user_id and coalesce(m.role,'')<>'owner' and (a.role='owner' or (not t.former_admin and m.user_id is null)))))
$$;
create or replace function public.account_deletion_preview(p_target uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=account_private.admin_actor(); reqs jsonb; reasons jsonb; s account_private.accounts; email text;
begin
 select * into strict s from account_private.accounts where id=p_target;
 select u.email into email from auth.users u where u.id=p_target;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'kind',kind,'label',label,'count',n,'allowNone',allow_none,'candidates',candidates,
 'blockedReason',case when not allow_none and candidates='[]' then label||' has no eligible active member' end) order by key),'[]'),
 coalesce(jsonb_agg(distinct label||' has no eligible active member') filter(where not allow_none and candidates='[]'),'[]')
 into reqs,reasons from account_private.requirements(p_target);
 if not account_private.authorized(actor,p_target,'delete') then reasons:=reasons||jsonb_build_array('Owner, self, and admin protection applies'); end if;
 if s.status='deleted' then reasons:=reasons||jsonb_build_array('Account already deleted'); end if;
 if s.status='active' then reasons:=reasons||jsonb_build_array('Deactivate the account before permanent deletion'); end if;
 return jsonb_build_object('userId',s.id,'status',s.status,'revision',s.revision,'confirmationEmail',coalesce(email,''),
 'requirements',reqs,'blockers',reasons,'counts',jsonb_build_object('boards',(select count(*) from boards where owner_id=p_target),
 'teams',(select count(*) from team_members where user_id=p_target),'groups',(select count(*) from conversation_members where user_id=p_target),
 'assignments',(select count(*) from cards where assignee_id=p_target),'tickets',(select count(*) from desk_tickets where requester_id=p_target or assignee_id=p_target or approver_id=p_target),
 'directReports',(select count(*) from employee_records where manager_id=p_target),'sharedFiles',(select count(*) from jsonb_array_elements(reqs) r where r->>'kind'='storage'),
 'requirements',jsonb_array_length(reqs)));
end $$;
create or replace function account_private.check_choices(p_target uuid,p_transfers jsonb) returns void language plpgsql as $$
declare r record; choice jsonb; keys text[]:=array[]::text[];
begin
 if jsonb_typeof(p_transfers) is distinct from 'object' then raise exception 'Transfer choices required' using errcode='22023'; end if;
 for r in select * from account_private.requirements(p_target) loop
  keys:=array_append(keys,r.key); choice:=p_transfers->r.key;
  if choice is null or (choice='null' and not r.allow_none) or (choice<>'null' and
    not exists(select from jsonb_array_elements(r.candidates) c where c->'id'=choice)) then
   raise exception 'Eligible successor required for %',r.label using errcode='22023'; end if;
 end loop;
 if (p_transfers-keys)<>'{}' then raise exception 'Transfer requirements changed. Refresh preview.' using errcode='40001'; end if;
end $$;
create or replace function account_private.operation_json(o account_private.operations,include_lease boolean default false) returns jsonb language sql immutable as $$
 select (to_jsonb(o)-array['lease_token','lease_until','prepared','available_at','revision'])||
 case when include_lease then jsonb_build_object('lease_token',o.lease_token) else '{}' end
$$;
create or replace function public.account_operation(p_target uuid,p_operation uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform account_private.admin_actor();
 return (select account_private.operation_json(o) from account_private.operations o where o.target_id=p_target
 and (p_operation is null or o.id=p_operation) order by o.created_at desc limit 1);
end $$;

create or replace function account_private.suspend(p_target uuid,p_id uuid) returns void language plpgsql set search_path=public,pg_temp as $$
declare c record; cleanup uuid;
begin
 delete from employee_admin_members where user_id=p_target and role='admin';
 -- Auth's schema is provider-owned. Revoke both session families when present.
 if to_regclass('auth.refresh_tokens') is not null then execute 'delete from auth.refresh_tokens where user_id::text=$1' using p_target::text; end if;
 if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id=$1' using p_target; end if;
 perform pg_advisory_xact_lock(71420261102);
 for c in select a.id,a.kind,p.media_identity from audio_calls a join audio_call_participants p on p.call_id=a.id
 where a.state<>'ended' and p.user_id=p_target for update of a,p loop
  update audio_call_participants set state='left',blocked=true where call_id=c.id and user_id=p_target;
  insert into audio_media_cleanup(room_name,identity) values('helios-'||c.id,c.media_identity::text) returning id into cleanup;
  insert into account_private.media values(p_id,cleanup);
  if c.kind='direct' or not exists(select from audio_call_participants where call_id=c.id and state='joined') then
   update audio_calls set state='ended',end_reason='removed',ended_at=clock_timestamp() where id=c.id;
  end if;
 end loop;
 -- Include cleanup queued earlier (including deactivation preceding a subsequent delete).
 insert into account_private.media(operation_id,cleanup_id)
 select p_id,q.id from audio_media_cleanup q join audio_call_participants p on q.room_name='helios-'||p.call_id
 where p.user_id=p_target and (q.identity is null or q.identity=p.media_identity::text) on conflict do nothing;
end $$;
create or replace function public.account_request_action(p_target uuid,p_action text,p_operation uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; s account_private.accounts; o account_private.operations; clean jsonb; actual_email text;
begin
 update employee_runtime set revision=revision+1 where singleton;
 actor:=account_private.admin_actor();
 if p_action is null or p_action not in ('reset_password','deactivate','reactivate','delete') or p_operation is null
 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid action' using errcode='22023'; end if;
 if not account_private.authorized(actor,p_target,p_action) then raise exception 'Owner or self protection prohibits this action' using errcode='42501'; end if;
 if (p_payload-case p_action when 'delete' then array['expectedRevision','confirmationEmail','transfers'] when 'reset_password' then array[]::text[] else array['expectedRevision'] end)<>'{}'
 then raise exception 'Unexpected action data' using errcode='22023'; end if;
 clean:=p_payload-'confirmationEmail';
 select * into o from account_private.operations where id=p_operation;
 if found then
  if (o.actor_id,o.target_id,o.action,o.payload) is distinct from (actor,p_target,p_action,clean) then raise exception 'Conflicting operation ID' using errcode='23505'; end if;
  return account_private.operation_json(o);
 end if;
 select * into strict s from account_private.accounts where id=p_target for update;
 if p_action='reset_password' and exists(select from account_private.operations where target_id=p_target and action='reset_password' and created_at>clock_timestamp()-interval '60 seconds') then
  raise exception 'Reset cooldown. Wait 60 seconds.' using errcode='55P03'; end if;
 if exists(select from account_private.operations where target_id=p_target and status in ('pending','running')) then raise exception 'An operation is in progress' using errcode='40001'; end if;
 if p_action<>'reset_password' and (clean->>'expectedRevision')::integer is distinct from s.revision then raise exception 'Account revision changed' using errcode='40001'; end if;
 if (p_action in ('reset_password','deactivate') and s.status<>'active') or (p_action='reactivate' and s.status<>'deactivated')
 or (p_action='delete' and s.status<>'deactivated') then raise exception 'Invalid account status. Deactivate before deletion.' using errcode='22023'; end if;
 if p_action='delete' then
  select email into actual_email from auth.users where id=p_target;
  if actual_email is null or lower(trim(p_payload->>'confirmationEmail')) is distinct from lower(actual_email) then raise exception 'Confirmation email does not match' using errcode='22023'; end if;
  perform account_private.check_choices(p_target,clean->'transfers');
 end if;
 if p_action in ('deactivate','delete') then
  update account_private.accounts set status=case when p_action='deactivate' then 'deactivated' else 'deleting' end,revision=revision+1 where id=p_target returning * into s;
 end if;
 insert into account_private.operations(id,actor_id,target_id,action,payload,revision) values(p_operation,actor,p_target,p_action,clean,s.revision) returning * into o;
 if p_action in ('deactivate','delete') then perform account_private.suspend(p_target,p_operation); end if;
 insert into account_private.audit(actor_id,target_id,action,outcome) values(actor,p_target,p_action,'pending');
 return account_private.operation_json(o);
end $$;

-- Serialize decisions with the same write used by existing employee/admin mutations.
create or replace function account_private.operation_valid(o account_private.operations) returns boolean language sql stable as $$
 select account_private.authorized(o.actor_id,o.target_id,o.action) and exists(select from account_private.accounts a
 where a.id=o.target_id and a.revision=o.revision and a.status=case o.action when 'reset_password' then 'active'
 when 'delete' then 'deleting' else 'deactivated' end)
$$;
create or replace function account_private.record_outcome(p_id uuid,p_status text,p_error text) returns void language plpgsql as $$
declare o account_private.operations;
begin
 update account_private.operations set status=p_status,last_error=p_error,lease_token=null,lease_until=null,updated_at=clock_timestamp(),
 available_at=case when p_status='pending' then clock_timestamp()+interval '20 seconds' * attempts else clock_timestamp() end
 where id=p_id returning * into strict o;
 insert into account_private.audit(actor_id,target_id,action,outcome) values(o.actor_id,o.target_id,o.action,p_status);
end $$;
create or replace function public.account_claim_operations() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o account_private.operations; jobs jsonb:='[]';
begin
 update employee_runtime set revision=revision+1 where singleton;
 for o in select * from account_private.operations where (status='pending' and available_at<=clock_timestamp())
 or (status='running' and lease_until<=clock_timestamp()) order by created_at,id limit 1 for update skip locked loop
  if o.status='running' and o.action='reset_password' and o.provider_attempted then perform account_private.record_outcome(o.id,'ambiguous','Provider acceptance unknown');
  elsif o.attempts>=5 then perform account_private.record_outcome(o.id,'failed','Retry limit reached');
  elsif not account_private.operation_valid(o) then perform account_private.record_outcome(o.id,'failed','Authorization or target changed');
  else
   update account_private.operations set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),
   lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp() where id=o.id returning * into o;
   jobs:=jobs||jsonb_build_array(account_private.operation_json(o,true));
  end if;
 end loop;
 return jobs;
end $$;
create or replace function public.account_validate_operation(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o account_private.operations;
begin
 update employee_runtime set revision=revision+1 where singleton;
 select * into o from account_private.operations where id=p_id and status='running' and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 if not account_private.operation_valid(o) then
  perform account_private.record_outcome(o.id,'failed','Authorization or target changed'); return false;
 end if;
 return true;
end $$;
create or replace function public.account_begin_reset(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.account_validate_operation(p_id,p_lease) then return false; end if;
 update account_private.operations set provider_attempted=true where id=p_id and action='reset_password' and not provider_attempted;
 return found;
end $$;
create or replace function public.account_retry_operation(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; o account_private.operations;
begin
 update employee_runtime set revision=revision+1 where singleton;
 actor:=account_private.admin_actor();
 select * into strict o from account_private.operations where id=p_id for update;
 if o.actor_id<>actor or not account_private.operation_valid(o) then raise exception 'Actor or target no longer authorized' using errcode='42501'; end if;
 if o.action='reset_password' or o.status<>'failed' then raise exception 'Operation cannot be retried' using errcode='22023'; end if;
 if exists(select from account_private.operations where target_id=o.target_id and status in ('pending','running')) then raise exception 'Another operation is in progress' using errcode='40001'; end if;
 update account_private.operations set attempts=0 where id=o.id;
 perform account_private.record_outcome(o.id,'pending',null);
 select * into o from account_private.operations where id=p_id;
 return account_private.operation_json(o);
end $$;

-- Ordinary board updates still cannot change ownership. This invoker trigger sees
-- the actual executing role (not a session variable); transfers run inside a
-- privileged definer and also require the live, frozen operation and successor.
create or replace function public.protect_board_owner() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.owner_id is distinct from old.owner_id then
  if current_user <> pg_get_userbyid((select proowner from pg_proc where oid='public.protect_board_owner()'::regprocedure)) then
   raise exception 'Board ownership cannot be changed by ordinary updates' using errcode='42501'; end if;
  if not exists(select from account_private.operations o where o.target_id=old.owner_id and o.action='delete' and o.status='running'
   and o.lease_until>clock_timestamp() and o.payload->'transfers'->>('board:'||old.id)=new.owner_id::text) then
   raise exception 'Prepared board ownership transfer required' using errcode='42501'; end if;
 end if; return new;
end $$;
-- Owner metadata does not alter the file evidence that was reviewed.
do $$ declare ddl text;
begin
 select pg_get_functiondef('public.approval_guard_attachment_object()'::regprocedure) into ddl;
 execute replace(ddl,'to_jsonb(old)=to_jsonb(new)',
 '(to_jsonb(old)-array[''owner'',''owner_id'',''updated_at''])=(to_jsonb(new)-array[''owner'',''owner_id'',''updated_at''])');
end $$;

-- Snapshot locks are transaction-local; no provider calls hold any of them.
create or replace function account_private.lock_transfers() returns void language plpgsql set search_path=public,pg_temp as $$
begin
 lock table boards,board_teams,teams,team_members,conversations,conversation_members,cards,columns,card_approval_settings,approval_requests,
 desk_agents,desk_tickets,desk_approvals,storage.objects in share row exclusive mode;
end $$;
create or replace function public.account_prepare_delete(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o account_private.operations; r record; code text; obj uuid; successor uuid; owner_updates text; t desk_tickets;
begin
 if not public.account_validate_operation(p_id,p_lease) then raise exception 'Invalid operation lease or authorization' using errcode='42501'; end if;
 select * into strict o from account_private.operations where id=p_id and action='delete';
 perform account_private.lock_transfers();
 if not o.prepared then
  perform account_private.check_choices(o.target_id,o.payload->'transfers');
  -- Materialize the requirements before mutation changes the candidate graph.
  for r in select * from account_private.requirements(o.target_id) loop
   code:=split_part(r.key,':',1); obj:=split_part(r.key,':',2)::uuid;
   successor:=(o.payload->'transfers'->>r.key)::uuid;
   case code
    when 'board' then update boards set owner_id=successor where id=obj;
    when 'team' then
     update teams set created_by=successor where id=obj and created_by=o.target_id;
     update team_members set role='owner' where team_id=obj and user_id=successor;
     update team_members set role='member' where team_id=obj and user_id=o.target_id;
    when 'group' then update conversation_members set is_admin=true where conversation_id=obj and user_id=successor;
    when 'card' then update cards set assignee_id=successor where id=obj;
    when 'review' then
     perform approval_invalidate(obj,'Offboarding reviewer reassignment');
     update card_approval_settings set reviewer_id=successor where card_id=obj;
    when 'ticket' then
     update desk_tickets set assignee_id=successor,updated_at=clock_timestamp() where id=obj;
     insert into desk_activity(ticket_id,actor_id,action) values(obj,o.actor_id,'offboarding_assignment');
    when 'approver' then
     select * into strict t from desk_tickets where id=obj;
     update desk_approvals set status='superseded',decided_at=clock_timestamp() where ticket_id=obj and status='pending';
     update desk_tickets set approver_id=successor,revision=revision+1,approval_status='pending',status='waiting',waiting_reason='approval',updated_at=clock_timestamp() where id=obj;
     insert into desk_approvals(ticket_id,revision,approver_id,status) values(obj,t.revision+1,successor,'pending');
     insert into desk_activity(ticket_id,actor_id,action) values(obj,o.actor_id,'offboarding_approval');
    when 'manager' then update employee_records set manager_id=successor,updated_at=clock_timestamp(),updated_by=o.actor_id where manager_id=o.target_id;
    when 'file' then
     select string_agg(case column_name when 'owner' then 'owner=$1' else 'owner_id=$1::text' end,',') into owner_updates
     from information_schema.columns where table_schema='storage' and table_name='objects' and column_name in ('owner','owner_id');
     execute 'update storage.objects set '||owner_updates||' where id=$2' using successor,obj;
   end case;
  end loop;
  delete from desk_agents where user_id=o.target_id;
  delete from team_members where user_id=o.target_id;
  delete from conversation_members where user_id=o.target_id;
  update account_private.operations set prepared=true where id=p_id;
 end if;
 if exists(select from account_private.requirements(o.target_id)) then raise exception 'Transfer requirements changed. Refresh preview.' using errcode='40001'; end if;
 return jsonb_build_object('targetId',o.target_id,'avatarPaths',(select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)),'[]')
 from storage.objects where bucket_id='avatars' and split_part(name,'/',1)=o.target_id::text));
end $$;
create or replace function account_private.has_media(p_id uuid) returns boolean language sql stable as $$
 select exists(select from account_private.media m join public.audio_media_cleanup q on q.id=m.cleanup_id where m.operation_id=p_id)
$$;
create or replace function public.account_finish_operation(p_id uuid,p_lease uuid,p_outcome text,p_error text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o account_private.operations; outcome text;
begin
 update employee_runtime set revision=revision+1 where singleton;
 select * into strict o from account_private.operations where id=p_id for update;
 if o.action='delete' and o.status='succeeded' and p_outcome='succeeded' then return; end if;
 if not public.account_validate_operation(p_id,p_lease) then return; end if;
 if p_outcome is null or p_outcome not in ('succeeded','retry','failed','ambiguous') then raise exception 'Invalid operation outcome'; end if;
 if p_outcome='succeeded' and o.action='delete' then raise exception 'Deletion requires confirmed Auth removal' using errcode='40001'; end if;
 if p_outcome='succeeded' and o.action='deactivate' and account_private.has_media(p_id) then raise exception 'Media cleanup pending' using errcode='40001'; end if;
 if p_outcome='succeeded' and o.action='reactivate' then update account_private.accounts set status='active',revision=revision+1 where id=o.target_id; end if;
 outcome:=case when p_outcome='retry' and o.action='reset_password' then 'ambiguous'
 when p_outcome='retry' and o.attempts<5 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end;
 -- Never persist external error strings, which may contain credentials or recovery URLs.
 perform account_private.record_outcome(o.id,outcome,case when outcome<>'succeeded' then
  case when outcome='ambiguous' then 'Provider acceptance unknown' else 'Provider operation incomplete' end end);
end $$;
create or replace function account_private.finalize_auth_delete() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare o account_private.operations;
begin
 update employee_runtime set revision=revision+1 where singleton;
 select * into o from account_private.operations where target_id=old.id and action='delete' and status='running'
 and prepared and lease_until>clock_timestamp() for update;
 if not found or not account_private.operation_valid(o) then raise exception 'Authorized prepared deletion required' using errcode='42501'; end if;
 perform account_private.lock_transfers();
 if account_private.has_media(o.id) or exists(select from account_private.requirements(old.id))
 or exists(select from storage.objects where bucket_id='avatars' and split_part(name,'/',1)=old.id::text) then
  raise exception 'Account cleanup incomplete' using errcode='40001'; end if;
 delete from employee_records where user_id=old.id;
 delete from account_private.directory where id=old.id;
 update employee_change_log set before_data=null,after_data=null where subject_id=old.id;
 delete from board_favorites where user_id=old.id;
 update profiles set full_name='Deleted user',email='deleted+'||old.id||'@invalid.example',avatar_url=null,anthropic_api_key=null,
 ai_enabled=false,email_notifications=false,auth_user_id=null,updated_at=clock_timestamp() where id=old.id;
 update approval_history set actor_name='Deleted user' where actor_id=old.id;
 update account_private.accounts set status='deleted',revision=revision+1 where id=old.id;
 perform account_private.record_outcome(o.id,'succeeded',null);
 return old;
end $$;
drop trigger if exists account_guard_auth_delete on auth.users;
create trigger account_guard_auth_delete before delete on auth.users for each row execute function account_private.finalize_auth_delete();


create or replace function public.account_identity_search(p_query text default '',p_exclude uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.account_is_active() then raise exception 'Account inactive' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by coalesce(full_name,email),id),'[]') from (
 select p.id,p.full_name,p.email,p.avatar_url from profiles p join account_private.accounts a on a.id=p.id
 where a.status='active' and p.id is distinct from p_exclude and concat_ws(' ',p.full_name,p.email) ilike '%'||left(coalesce(p_query,''),100)||'%'
 order by coalesce(p.full_name,p.email),p.id limit greatest(1,least(100,coalesce(p_limit,100)))) x);
end $$;
create or replace function public.employee_manager_search(p_query text default '') returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(p-'avatar_url'),'[]') from jsonb_array_elements(public.account_identity_search(p_query,null,25)) p
$$;

-- Delivery workers run without an end-user JWT, so caller guards cannot establish
-- recipient eligibility. Keep membership/preferences for reactivation, while both
-- delivery claiming and the final provider-call check reject inactive recipients.
-- Preserve the existing workflow rules and function OID; replay must not copy the
-- trampoline over its original implementation.
do $$ declare ddl text;
begin
 if (select prosrc not like '%account_private.workflow_notification_current%'
     from pg_proc where oid='public.workflow_notification_current(uuid)'::regprocedure) then
  select pg_get_functiondef('public.workflow_notification_current(uuid)'::regprocedure) into ddl;
  execute replace(ddl,'FUNCTION public.workflow_notification_current(',
    'FUNCTION account_private.workflow_notification_current(');
 end if;
end $$;
create or replace function public.workflow_notification_current(p_notification uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select from notifications n join account_private.accounts a on a.id=n.recipient_id
   where n.id=p_notification and a.status='active') then return false; end if;
 return account_private.workflow_notification_current(p_notification);
end $$;

-- Existing writers still accept their old inputs. Lock each newly named account
-- before assigning responsibilities; a concurrent suspension waits or wins first.
create or replace function account_private.require_active_reference() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare field text; candidate uuid; prev jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}' end;
begin
 foreach field in array tg_argv loop
  if to_jsonb(new)->field is not distinct from prev->field then continue; end if;
  candidate:=nullif(to_jsonb(new)->>field,'')::uuid;
  if candidate is not null then
   perform 1 from account_private.accounts where id=candidate and status='active' for share;
   if not found then raise exception 'An active account is required for %',field using errcode='22023'; end if;
  end if;
 end loop;
 return new;
end $$;
drop trigger if exists account_assignee on cards;
create trigger account_assignee before insert or update of assignee_id on cards for each row execute function account_private.require_active_reference('assignee_id');
drop trigger if exists account_manager on employee_records;
create trigger account_manager before insert or update of manager_id on employee_records for each row execute function account_private.require_active_reference('user_id','manager_id');
drop trigger if exists account_reviewer on card_approval_settings;
create trigger account_reviewer before insert or update of reviewer_id on card_approval_settings for each row execute function account_private.require_active_reference('reviewer_id');
drop trigger if exists account_ticket_staff on desk_tickets;
create trigger account_ticket_staff before insert or update of assignee_id,approver_id on desk_tickets for each row execute function account_private.require_active_reference('assignee_id','approver_id');
drop trigger if exists account_desk_agent on desk_agents;
create trigger account_desk_agent before insert or update of user_id on desk_agents for each row execute function account_private.require_active_reference('user_id');
drop trigger if exists account_team_member on team_members;
create trigger account_team_member before insert or update of user_id on team_members for each row execute function account_private.require_active_reference('user_id');
drop trigger if exists account_chat_member on conversation_members;
create trigger account_chat_member before insert or update of user_id on conversation_members for each row execute function account_private.require_active_reference('user_id');
drop trigger if exists account_board_owner on boards;
create trigger account_board_owner before insert or update of owner_id on boards for each row execute function account_private.require_active_reference('owner_id');


-- Explicit allowlists also override default Supabase function grants.
do $$ declare f record;
begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'account\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('account_begin_maintenance','account_claim_operations','account_validate_operation','account_begin_reset','account_prepare_delete','account_finish_operation') then
   execute format('grant execute on function %s to service_role',f.signature);
  else execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
revoke all on all tables in schema account_private from public,anon,authenticated,service_role;
revoke all on all functions in schema account_private from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;



