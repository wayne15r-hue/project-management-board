-- Central employee administration, independent of project teams and work access.
begin;
create table if not exists public.employee_admin_members (
 user_id uuid primary key references auth.users(id) on delete restrict,
 role text not null check(role in ('owner','admin')),
 created_at timestamptz not null default now()
);
create unique index if not exists employee_single_owner on public.employee_admin_members(role) where role='owner';
create table if not exists public.employee_departments (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 archived boolean not null default false, created_at timestamptz not null default now()
);
create unique index if not exists employee_department_name on public.employee_departments(lower(trim(name)));
-- Seed only on the first installation; replay must not recreate renamed departments.
create table if not exists public.employee_runtime (
 singleton boolean primary key default true check(singleton), revision bigint not null default 0
);
insert into public.employee_departments(name)
 select name from unnest(array['Administration','Operations','IT','HR','Finance','Sales','Marketing']) name
 where not exists(select 1 from public.employee_runtime)
 on conflict do nothing;
insert into public.employee_runtime(singleton) values(true) on conflict do nothing;
create table if not exists public.employee_records (
 user_id uuid primary key references auth.users(id) on delete restrict,
 department_id uuid not null references public.employee_departments(id) on delete restrict,
 job_title text not null check(length(trim(job_title)) between 1 and 200),
 manager_id uuid references auth.users(id) on delete restrict,
 completed_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id) on delete restrict,
 check(manager_id is distinct from user_id)
);
create index if not exists employee_manager on public.employee_records(manager_id);
create table if not exists public.employee_change_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id) on delete restrict,
 action text not null, subject_id uuid, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
alter table public.employee_admin_members enable row level security;
alter table public.employee_departments enable row level security;
alter table public.employee_records enable row level security;
alter table public.employee_change_log enable row level security;
alter table public.employee_runtime enable row level security;
revoke all on public.employee_admin_members,public.employee_departments,public.employee_records,public.employee_change_log,public.employee_runtime from public,anon,authenticated;
grant select on public.employee_admin_members,public.employee_departments,public.employee_records,public.employee_change_log to authenticated;

create or replace function public.employee_admin_role() returns text
 language sql stable security definer set search_path=public,pg_temp as $$
 select role from public.employee_admin_members where user_id=auth.uid()
$$;
drop policy if exists employee_admin_read on public.employee_admin_members;
create policy employee_admin_read on public.employee_admin_members for select to authenticated
 using(user_id=auth.uid() or public.employee_admin_role() is not null);
drop policy if exists employee_department_read on public.employee_departments;
create policy employee_department_read on public.employee_departments for select to authenticated using(true);
drop policy if exists employee_record_read on public.employee_records;
create policy employee_record_read on public.employee_records for select to authenticated
 using(user_id=auth.uid() or public.employee_admin_role() is not null);
drop policy if exists employee_history_read on public.employee_change_log;
create policy employee_history_read on public.employee_change_log for select to authenticated using(public.employee_admin_role() is not null);

-- A real singleton-row write serializes ALL graph/department/membership mutations.
-- Unlike advisory locks alone, it also forces stale repeatable-read writers to abort.
create or replace function public.employee_write_record(p_user uuid,p_department uuid,p_title text,p_manager uuid,p_initial boolean)
 returns public.employee_records language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.employee_records; result public.employee_records;
begin
 update public.employee_runtime set revision=revision+1 where singleton;
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_initial then
  if p_user is distinct from auth.uid() then raise exception 'Own setup only' using errcode='42501'; end if;
 else
  if not exists(select 1 from public.employee_admin_members where user_id=auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 end if;
 select * into previous from public.employee_records where user_id=p_user;
 if p_initial and previous.user_id is not null then raise exception 'Employee setup already completed' using errcode='23505'; end if;
 if not p_initial and previous.user_id is null then raise exception 'The employee must complete their own setup first' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'User not found' using errcode='22023'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Job title must contain 1 to 200 characters' using errcode='22023'; end if;
 if not exists(select 1 from public.employee_departments where id=p_department and (not archived or (not p_initial and previous.department_id=p_department))) then
  raise exception 'Select an active department' using errcode='22023';
 end if;
 if p_manager=p_user then raise exception 'Cannot report to yourself' using errcode='22023'; end if;
 if p_manager is not null and not exists(select 1 from public.profiles where id=p_manager) then raise exception 'Reporting manager not found' using errcode='22023'; end if;
 if exists(with recursive managers(id) as (
  select p_manager where p_manager is not null
  union select r.manager_id from public.employee_records r join managers m on r.user_id=m.id where r.manager_id is not null
 ) select 1 from managers where id=p_user) then raise exception 'Reporting cycle is not allowed' using errcode='22023'; end if;
 insert into public.employee_records(user_id,department_id,job_title,manager_id,updated_by)
 values(p_user,p_department,trim(p_title),p_manager,auth.uid())
 on conflict(user_id) do update set department_id=excluded.department_id,job_title=excluded.job_title,manager_id=excluded.manager_id,updated_at=clock_timestamp(),updated_by=auth.uid()
 returning * into result;
 insert into public.employee_change_log(actor_id,action,subject_id,before_data,after_data)
 values(auth.uid(),case when p_initial then 'employee_setup' else 'employee_updated' end,p_user,case when previous.user_id is not null then to_jsonb(previous) end,to_jsonb(result));
 return result;
end $$;
-- The internal writer is never exposed to authenticated callers.
create or replace function public.employee_submit(p_department uuid,p_title text,p_manager uuid)
 returns public.employee_records language plpgsql security definer set search_path=public,pg_temp as $$
begin return public.employee_write_record(auth.uid(),p_department,p_title,p_manager,true); end $$;
create or replace function public.employee_admin_save(p_user uuid,p_department uuid,p_title text,p_manager uuid)
 returns public.employee_records language plpgsql security definer set search_path=public,pg_temp as $$
begin return public.employee_write_record(p_user,p_department,p_title,p_manager,false); end $$;

create or replace function public.employee_set_admin(p_user uuid,p_enabled boolean)
 returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare previous jsonb;
begin
 update public.employee_runtime set revision=revision+1 where singleton;
 if not exists(select 1 from public.employee_admin_members where user_id=auth.uid() and role='owner') then raise exception 'Owner required' using errcode='42501'; end if;
 if exists(select 1 from public.employee_admin_members where user_id=p_user and role='owner') then raise exception 'Owner access is protected' using errcode='42501'; end if;
 if p_enabled is null or not exists(select 1 from public.profiles where id=p_user) then raise exception 'User not found' using errcode='22023'; end if;
 select to_jsonb(m) into previous from public.employee_admin_members m where user_id=p_user;
 if p_enabled then insert into public.employee_admin_members(user_id,role) values(p_user,'admin') on conflict do nothing;
 else delete from public.employee_admin_members where user_id=p_user and role='admin'; end if;
 insert into public.employee_change_log(actor_id,action,subject_id,before_data,after_data)
 values(auth.uid(),case when p_enabled then 'admin_granted' else 'admin_revoked' end,p_user,previous,
  (select to_jsonb(m) from public.employee_admin_members m where user_id=p_user));
end $$;

create or replace function public.employee_save_department(p_id uuid,p_name text,p_archived boolean)
 returns public.employee_departments language plpgsql security definer set search_path=public,pg_temp as $$
declare previous jsonb; result public.employee_departments;
begin
 update public.employee_runtime set revision=revision+1 where singleton;
 if not exists(select 1 from public.employee_admin_members where user_id=auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 or p_archived is null then raise exception 'Department name must contain 1 to 100 characters' using errcode='22023'; end if;
 select to_jsonb(d) into previous from public.employee_departments d where id=p_id;
 if p_id is not null and previous is null then raise exception 'Department not found' using errcode='22023'; end if;
 if p_archived and not exists(select 1 from public.employee_departments where not archived and id is distinct from p_id) then raise exception 'Keep at least one active department' using errcode='22023'; end if;
 insert into public.employee_departments(id,name,archived) values(coalesce(p_id,gen_random_uuid()),trim(p_name),p_archived)
 on conflict(id) do update set name=excluded.name,archived=excluded.archived returning * into result;
 insert into public.employee_change_log(actor_id,action,subject_id,before_data,after_data)
 values(auth.uid(),'department_saved',result.id,previous,to_jsonb(result));
 return result;
end $$;

-- Deployment-only bootstrap: UUID comes from confirmed auth.users, never profiles.
create or replace function public.employee_bootstrap_owner(p_user uuid)
 returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.employee_runtime set revision=revision+1 where singleton;
 if not exists(select 1 from auth.users where id=p_user and lower(email)='omkar.bahirat1@proton.me' and email_confirmed_at is not null) then
  raise exception 'Verified owner auth account required' using errcode='22023';
 end if;
 if exists(select 1 from public.employee_admin_members where role='owner' and user_id<>p_user) then raise exception 'Owner already exists'; end if;
 if exists(select 1 from public.employee_admin_members where user_id=p_user and role='owner') then return; end if;
 insert into public.employee_admin_members(user_id,role) values(p_user,'owner') on conflict(user_id) do update set role='owner';
 insert into public.employee_change_log(actor_id,action,subject_id) values(p_user,'owner_bootstrapped',p_user);
end $$;

revoke all on function public.employee_admin_role(),public.employee_write_record(uuid,uuid,text,uuid,boolean),public.employee_submit(uuid,text,uuid),public.employee_admin_save(uuid,uuid,text,uuid),public.employee_set_admin(uuid,boolean),public.employee_save_department(uuid,text,boolean),public.employee_bootstrap_owner(uuid) from public,anon,authenticated;
grant execute on function public.employee_admin_role(),public.employee_submit(uuid,text,uuid),public.employee_admin_save(uuid,uuid,text,uuid),public.employee_set_admin(uuid,boolean),public.employee_save_department(uuid,text,boolean) to authenticated;
grant execute on function public.employee_bootstrap_owner(uuid) to service_role;

create or replace function public.employee_manager_search(p_query text default '')
 returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from (
  select id,full_name,email from public.profiles where auth.uid() is not null and
   (coalesce(full_name,'') ilike '%'||left(coalesce(p_query,''),100)||'%' or email ilike '%'||left(coalesce(p_query,''),100)||'%')
  order by coalesce(full_name,email),id limit 25
 ) p
$$;
create or replace function public.employee_setup_state()
 returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('userId',auth.uid(),'role',public.employee_admin_role(),
  'record',(select to_jsonb(r) from public.employee_records r where user_id=auth.uid()),
  'departments',(select coalesce(jsonb_agg(to_jsonb(d) order by d.name),'[]'::jsonb) from public.employee_departments d),
  'manager',(select jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email) from public.employee_records r join public.profiles p on p.id=r.manager_id where r.user_id=auth.uid()))
$$;
create or replace function public.employee_directory(p_query text default '',p_page integer default 1)
 returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; total bigint; page integer:=greatest(1,least(coalesce(p_page,1),1000000));
begin
 if not exists(select 1 from public.employee_admin_members where user_id=auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 select count(*) into total from public.profiles p where coalesce(p.full_name,'') ilike '%'||left(coalesce(p_query,''),100)||'%' or p.email ilike '%'||left(coalesce(p_query,''),100)||'%';
 select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
  select jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'record',to_jsonb(r),'department',d.name,
   'manager',case when m.id is not null then jsonb_build_object('id',m.id,'full_name',m.full_name,'email',m.email) end,'adminRole',a.role) row_data
  from public.profiles p left join public.employee_records r on r.user_id=p.id
  left join public.employee_departments d on d.id=r.department_id left join public.profiles m on m.id=r.manager_id
  left join public.employee_admin_members a on a.user_id=p.id
  where coalesce(p.full_name,'') ilike '%'||left(coalesce(p_query,''),100)||'%' or p.email ilike '%'||left(coalesce(p_query,''),100)||'%'
  order by coalesce(p.full_name,p.email),p.id limit 25 offset ((page-1)*25)
 ) rows;
 return jsonb_build_object('items',result,'total',total,'page',page);
end $$;
revoke all on function public.employee_manager_search(text),public.employee_setup_state(),public.employee_directory(text,integer) from public,anon,authenticated;
grant execute on function public.employee_manager_search(text),public.employee_setup_state(),public.employee_directory(text,integer) to authenticated;
create or replace function public.employee_admin_list()
 returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.employee_admin_members where user_id=auth.uid()) then raise exception 'Admin required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',m.role) order by m.role desc,p.email),'[]'::jsonb)
  from public.employee_admin_members m join public.profiles p on p.id=m.user_id);
end $$;
revoke all on function public.employee_admin_list() from public,anon,authenticated;
grant execute on function public.employee_admin_list() to authenticated;
commit;
