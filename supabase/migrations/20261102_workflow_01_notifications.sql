begin;
create table if not exists public.board_workflow_settings(board_id uuid primary key references public.boards(id) on delete cascade,timezone text not null default 'UTC',scheduling_enabled boolean not null default false);
create table if not exists public.workflow_runtime(singleton boolean primary key default true check(singleton),producers_enabled boolean not null default false);
insert into public.workflow_runtime values(true,false) on conflict do nothing;
alter table public.cards add column if not exists notification_assignment_version bigint not null default 0;
alter table public.cards add column if not exists notification_due_version bigint not null default 0;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in ('assignment','mention','comment','review_requested','review_approved','review_changes_requested','review_withdrawn','review_invalidated','due_today','overdue','escalation'));
alter table public.notifications add column if not exists event_key text;
alter table public.notifications add column if not exists metadata jsonb not null default '{}';
create unique index if not exists notifications_event_recipient on public.notifications(event_key,recipient_id);
create table if not exists public.workflow_deliveries(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null unique references public.notifications(id) on delete cascade,
 board_id uuid not null references public.boards(id) on delete cascade,status text not null default 'pending' check(status in ('pending','leased','failed','disabled','needs_review','accepted','cancelled')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,
 first_attempt_at timestamptz,payload jsonb,provider_id text,last_error text,created_at timestamptz not null default now());
create index if not exists workflow_due on public.workflow_deliveries(next_attempt_at) where status in ('pending','leased');
alter table public.workflow_deliveries enable row level security;
alter table public.workflow_runtime enable row level security;
alter table public.board_workflow_settings enable row level security;
revoke all on public.workflow_deliveries,public.workflow_runtime,public.board_workflow_settings from public,anon,authenticated;
grant all on public.workflow_deliveries,public.workflow_runtime,public.board_workflow_settings to service_role;
create or replace function public.workflow_has_access(p_board uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
 select p_user is not null and exists(select 1 from boards b where b.id=p_board and (b.owner_id=p_user or exists(select 1 from board_teams bt join team_members tm on tm.team_id=bt.team_id where bt.board_id=b.id and tm.user_id=p_user)));
$$;
create or replace function public.workflow_user_board_access(p_board uuid) returns boolean language sql stable security definer set search_path=public as $$
 select workflow_has_access(p_board,auth.uid());
$$;
create or replace function public.workflow_emit(p_event_key text,p_type text,p_card_id uuid,p_actor_id uuid,p_recipients uuid[],p_title text,p_body text default null,p_metadata jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare c public.cards; r uuid; n uuid;
begin
 select * into c from cards where id=p_card_id;
 if c.id is null or (p_actor_id is not null and not workflow_has_access(c.board_id,p_actor_id)) then return; end if;
 for r in select distinct unnest(p_recipients) loop
  if r is null or r=p_actor_id or not workflow_has_access(c.board_id,r) then continue; end if;
  insert into notifications(recipient_id,actor_id,type,card_id,board_id,title,body,event_key,metadata)
  values(r,p_actor_id,p_type,c.id,c.board_id,p_title,p_body,p_event_key,p_metadata) on conflict(event_key,recipient_id) do nothing returning id into n;
  if n is not null then insert into workflow_deliveries(notification_id,board_id) values(n,c.board_id); end if;
 end loop;
end $$;
-- Canonical source keys are shared by the original write triggers and compatibility clients.
create or replace function public.workflow_legacy_key(p_card uuid,p_actor uuid,p_type text,p_activity uuid) returns text language sql stable security definer set search_path=public as $$
 select case when p_type='assignment' then 'assignment:'||c.id||':'||c.notification_assignment_version else 'comment:'||p_activity end from cards c where c.id=p_card;
$$;
create or replace function public.workflow_notify_legacy(p_card_id uuid,p_board_id uuid,p_actor_id uuid,p_recipient_id uuid,p_type text,p_activity_log_id uuid,p_title text,p_body text) returns void language plpgsql security definer set search_path=public as $$
declare c cards; a activity_log;
begin
 -- Once triggers are active the compatibility helper cannot reconstruct an older source version.
 if (select producers_enabled from workflow_runtime where singleton) then return; end if;
 if not notification_recipient_allowed(p_card_id,p_board_id,p_actor_id,p_recipient_id) then return; end if;
 if p_type='assignment' and not exists(select 1 from cards where id=p_card_id and assignee_id=p_recipient_id) then return; end if;
 if p_type in ('comment','mention') and not exists(select 1 from activity_log where id=p_activity_log_id and card_id=p_card_id and actor_id=p_actor_id and action='commented') then return; end if;
 select * into c from cards where id=p_card_id;
 if p_type='assignment' then
  perform workflow_emit(workflow_legacy_key(p_card_id,p_actor_id,p_type,p_activity_log_id),p_type,p_card_id,p_actor_id,array[p_recipient_id],'You were assigned "'||c.title||'"',null,jsonb_build_object('assignment_version',c.notification_assignment_version));
 elsif p_type in ('comment','mention') then
  select * into a from activity_log where id=p_activity_log_id;
  if p_type='comment' and p_recipient_id is distinct from c.assignee_id and p_recipient_id is distinct from c.created_by then return; end if;
  if p_type='mention' and not exists(
   select 1 from profiles p cross join regexp_matches(coalesce(a.changes->>'text',''),'@([\w._-]{2,})','g') m where p.id=p_recipient_id and
   (regexp_replace(lower(coalesce(p.full_name,'')),'[\s._-]','','g') like '%'||regexp_replace(lower(m[1]),'[\s._-]','','g')||'%' or regexp_replace(lower(split_part(p.email,'@',1)),'[\s._-]','','g') like '%'||regexp_replace(lower(m[1]),'[\s._-]','','g')||'%')
  ) then return; end if;
  perform workflow_emit(workflow_legacy_key(p_card_id,p_actor_id,p_type,p_activity_log_id),p_type,p_card_id,p_actor_id,array[p_recipient_id],case when p_type='mention' then 'You were mentioned in "' else 'New comment on "' end||c.title||'"',left(a.changes->>'text',500));
 end if;
end $$;
-- A duplicate legacy INSERT must fail, not silently succeed: old servers send email only after successful inserts.
create or replace function public.workflow_legacy_insert() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.event_key is null and (select producers_enabled from workflow_runtime where singleton) then
  raise exception 'Notification already captured by source transaction' using errcode='23505';
 end if;
 if new.event_key is null then
  new.event_key:=workflow_legacy_key(new.card_id,new.actor_id,new.type,new.activity_log_id);
 end if;
 return new;
end $$;
drop trigger if exists workflow_legacy_insert on public.notifications;
create trigger workflow_legacy_insert before insert on public.notifications for each row execute function public.workflow_legacy_insert();
create or replace function public.workflow_card_versions() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then new.notification_assignment_version:=1; new.notification_due_version:=1;
 else
  new.notification_assignment_version:=old.notification_assignment_version+case when new.assignee_id is distinct from old.assignee_id then 1 else 0 end;
  new.notification_due_version:=old.notification_due_version+case when new.due_date is distinct from old.due_date or new.assignee_id is distinct from old.assignee_id then 1 else 0 end;
 end if;
 return new;
end $$;
drop trigger if exists workflow_card_versions on public.cards;
create trigger workflow_card_versions before insert or update on public.cards for each row execute function public.workflow_card_versions();
create or replace function public.workflow_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not (select producers_enabled from workflow_runtime where singleton) then return new; end if;
 if new.assignee_id is not null and (tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id) then
  perform workflow_emit('assignment:'||new.id||':'||new.notification_assignment_version,'assignment',new.id,coalesce(auth.uid(),new.created_by),array[new.assignee_id],'You were assigned "'||new.title||'"',null,jsonb_build_object('assignment_version',new.notification_assignment_version));
 end if;
 return new;
end $$;
drop trigger if exists workflow_assignment on public.cards;
create trigger workflow_assignment after insert or update on public.cards for each row execute function public.workflow_assignment();
create or replace function public.workflow_comment() returns trigger language plpgsql security definer set search_path=public as $$
declare c public.cards; mentions uuid[]; r uuid;
begin
 if new.action<>'commented' or not (select producers_enabled from workflow_runtime where singleton) then return new; end if;
 select * into c from cards where id=new.card_id;
 select array_agg(distinct p.id) into mentions from profiles p cross join regexp_matches(coalesce(new.changes->>'text',''),'@([\w._-]{2,})','g') m
 where (regexp_replace(lower(coalesce(p.full_name,'')),'[\s._-]','','g') like '%'||regexp_replace(lower(m[1]),'[\s._-]','','g')||'%'
 or regexp_replace(lower(split_part(p.email,'@',1)),'[\s._-]','','g') like '%'||regexp_replace(lower(m[1]),'[\s._-]','','g')||'%') and workflow_has_access(c.board_id,p.id);
 perform workflow_emit('comment:'||new.id,'mention',c.id,new.actor_id,mentions,'You were mentioned in "'||c.title||'"',left(new.changes->>'text',500));
 for r in select distinct unnest(array[c.assignee_id,c.created_by]) except select unnest(coalesce(mentions,'{}')) loop
  perform workflow_emit('comment:'||new.id,'comment',c.id,new.actor_id,array[r],'New comment on "'||c.title||'"',left(new.changes->>'text',500));
 end loop;
 return new;
end $$;
drop trigger if exists workflow_comment on public.activity_log;
create trigger workflow_comment after insert on public.activity_log for each row execute function public.workflow_comment();
drop policy if exists "Notifications select own" on public.notifications;
create policy "Notifications select own" on public.notifications for select to authenticated using(recipient_id=auth.uid() and workflow_user_board_access(board_id));
drop policy if exists "Notifications update own" on public.notifications;
create policy "Notifications update own" on public.notifications for update to authenticated using(recipient_id=auth.uid() and workflow_user_board_access(board_id)) with check(recipient_id=auth.uid() and workflow_user_board_access(board_id));
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'workflow_%' loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated'; execute 'grant execute on function '||f.signature||' to service_role'; end loop; end $$;
-- RLS calls this helper for only the caller's board access; it exposes no private content.
grant execute on function public.workflow_user_board_access(uuid) to authenticated;
commit;
