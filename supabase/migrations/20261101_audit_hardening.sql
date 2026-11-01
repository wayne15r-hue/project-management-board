-- Run in a transaction. Stop on inconsistent legacy relationships; never discard records.
begin;

do $$
declare bad_cards bigint; bad_labels bigint;
begin
  select count(*) into bad_cards from public.cards c join public.columns col on col.id=c.column_id where c.board_id<>col.board_id;
  select count(*) into bad_labels from public.card_labels cl join public.cards c on c.id=cl.card_id join public.labels l on l.id=cl.label_id where c.board_id<>l.board_id;
  if bad_cards>0 or bad_labels>0 then
    raise exception 'Audit preflight: % cards reference another board column; % card-label links cross boards. Repair these relationships explicitly and rerun; no records were deleted.',bad_cards,bad_labels
      using hint='Inspect cards JOIN columns ON cards.column_id=columns.id and card_labels JOIN cards/labels; preserve and relocate intended records before retrying.';
  end if;
end $$;

alter table public.columns add constraint columns_id_board_key unique(id,board_id);
alter table public.cards add constraint cards_id_board_key unique(id,board_id);
alter table public.labels add constraint labels_id_board_key unique(id,board_id);
alter table public.cards drop constraint cards_column_id_fkey;
-- Preserve the PostgREST relationship name used by existing clients.
alter table public.cards add constraint cards_column_id_fkey foreign key(column_id,board_id) references public.columns(id,board_id) on delete cascade;
alter table public.card_labels add column board_id uuid;
update public.card_labels cl set board_id=c.board_id from public.cards c where c.id=cl.card_id;
alter table public.card_labels alter column board_id set not null;
alter table public.card_labels drop constraint card_labels_card_id_fkey;
alter table public.card_labels drop constraint card_labels_label_id_fkey;
alter table public.card_labels add constraint card_labels_card_id_fkey foreign key(card_id,board_id) references public.cards(id,board_id) on delete cascade;
alter table public.card_labels add constraint card_labels_label_id_fkey foreign key(label_id,board_id) references public.labels(id,board_id) on delete cascade;
create function public.set_card_label_board() returns trigger language plpgsql set search_path=public as $$
begin
  select c.board_id into new.board_id from public.cards c where c.id=new.card_id;
  return new;
end $$;
create trigger card_label_board before insert or update on public.card_labels for each row execute function public.set_card_label_board();

create or replace function public.user_has_board_access(board_uuid uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.boards b where b.id=board_uuid and b.owner_id=auth.uid())
      or exists(select 1 from public.board_teams bt join public.team_members tm on tm.team_id=bt.team_id where bt.board_id=board_uuid and tm.user_id=auth.uid());
$$;
create function public.user_has_card_access(card_uuid uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.cards c where c.id=card_uuid and public.user_has_board_access(c.board_id));
$$;
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.conversation_members m where m.conversation_id=conv_id and m.user_id=auth.uid());
$$;
create function public.is_team_member(p_team_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.team_members m where m.team_id=p_team_id and m.user_id=auth.uid());
$$;
create function public.is_team_admin(p_team_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.team_members m where m.team_id=p_team_id and m.user_id=auth.uid() and m.role in ('owner','admin'));
$$;

drop policy "Labels access" on public.labels;
create policy "Labels board access" on public.labels for all to authenticated using(public.user_has_board_access(board_id)) with check(public.user_has_board_access(board_id));
drop policy "Card labels access" on public.card_labels;
create policy "Card labels board access" on public.card_labels for all to authenticated using(public.user_has_board_access(board_id)) with check(public.user_has_board_access(board_id));
drop policy "Attachments access" on public.attachments;
create policy "Attachments read" on public.attachments for select to authenticated using(public.user_has_card_access(card_id));
create policy "Attachments insert" on public.attachments for insert to authenticated with check(public.user_has_card_access(card_id) and uploaded_by=auth.uid() and storage_path like card_id::text||'/%');
create policy "Attachments update" on public.attachments for update to authenticated using(public.user_has_card_access(card_id)) with check(public.user_has_card_access(card_id) and storage_path like card_id::text||'/%');
create policy "Attachments delete" on public.attachments for delete to authenticated using(public.user_has_card_access(card_id));

-- Use text prefix comparisons so malformed paths fail closed without UUID cast errors.
-- Public bucket downloads bypass read policies, so enforce the intended bucket privacy too.
update storage.buckets set public=false where id in ('attachments','chat-files');
create function public.can_access_attachment_object(p_name text) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.cards c where c.id::text=split_part(p_name,'/',1) and position('/' in p_name)>0 and public.user_has_board_access(c.board_id));
$$;
create function public.can_access_chat_object(p_name text) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.conversation_members m where m.conversation_id::text=split_part(p_name,'/',1) and position('/' in p_name)>0 and m.user_id=auth.uid());
$$;
drop policy "Authenticated users can view attachments" on storage.objects;
drop policy "Authenticated users can upload attachments" on storage.objects;
drop policy "Authenticated users can delete attachments" on storage.objects;
drop policy "Chat files read" on storage.objects;
drop policy "Chat files upload" on storage.objects;
create policy "Private attachment objects" on storage.objects for all to authenticated using(bucket_id='attachments' and public.can_access_attachment_object(name)) with check(bucket_id='attachments' and public.can_access_attachment_object(name));
create policy "Private chat objects" on storage.objects for all to authenticated using(bucket_id='chat-files' and public.can_access_chat_object(name)) with check(bucket_id='chat-files' and public.can_access_chat_object(name));

-- Leave historical secrets intact for operator assessment; clients receive only safe columns.
revoke select,insert,update on public.profiles from public,anon,authenticated;
revoke select(anthropic_api_key),insert(anthropic_api_key),update(anthropic_api_key) on public.profiles from public,anon,authenticated;
grant select(id,full_name,avatar_url,email,created_at,updated_at,ai_enabled,email_notifications) on public.profiles to authenticated;
grant insert(id,full_name,avatar_url,email,ai_enabled,email_notifications),update(full_name,avatar_url,email,updated_at,ai_enabled,email_notifications) on public.profiles to authenticated;

create function public.protect_board_owner() returns trigger language plpgsql set search_path=public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Board ownership cannot be changed by ordinary updates' using errcode='42501';
  end if;
  return new;
end $$;
create trigger protect_board_owner before update on public.boards for each row execute function public.protect_board_owner();

-- Membership identities and privileges are server managed. Members can update only read state.
drop policy "Members insert" on public.conversation_members;
revoke insert,update on public.conversation_members from public,anon,authenticated;
grant update(last_read_at) on public.conversation_members to authenticated;

drop policy "Team select" on public.teams;
drop policy "Team insert" on public.teams;
drop policy "Team members select" on public.team_members;
drop policy "Team members manage" on public.team_members;
drop policy "Invites insert" on public.invites;
drop policy "Invites select" on public.invites;
drop policy "Board teams access" on public.board_teams;
create policy "Team member read" on public.teams for select to authenticated using(public.is_team_member(id));
create policy "Team membership read" on public.team_members for select to authenticated using(public.is_team_member(team_id));
-- auth.users is not client-readable; use an auth-scoped helper instead of a policy subquery.
create function public.current_auth_email() returns text language sql security definer stable set search_path=public as $$select lower(u.email) from auth.users u where u.id=auth.uid()$$;
create policy "Invites authorized read" on public.invites for select to authenticated using(public.is_team_admin(team_id) or lower(email)=public.current_auth_email());
create policy "Board teams read" on public.board_teams for select to authenticated using(public.user_has_board_access(board_id));
create policy "Board teams manage" on public.board_teams for all to authenticated using(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=auth.uid()) and public.is_team_admin(team_id)) with check(exists(select 1 from public.boards b where b.id=board_id and b.owner_id=auth.uid()) and public.is_team_admin(team_id));
revoke insert,update,delete on public.teams,public.team_members,public.invites from public,anon,authenticated;

create function public.create_team(p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid team name' using errcode='22023'; end if;
  insert into public.teams(name,created_by) values(trim(p_name),auth.uid()) returning id into result;
  insert into public.team_members(team_id,user_id,role) values(result,auth.uid(),'owner');
  return result;
end $$;

create function public.invite_team_member(p_team_id uuid,p_email text) returns public.invites language plpgsql security definer set search_path=public as $$
declare result public.invites; normalized text:=lower(trim(p_email));
begin
  -- Serialize invitations and membership acceptance for this team.
  perform 1 from public.teams where id=p_team_id for update;
  if not public.is_team_admin(p_team_id) then raise exception 'Only team admins may invite members' using errcode='42501'; end if;
  if normalized is null or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized)>320 then raise exception 'Invalid email' using errcode='22023'; end if;
  if exists(select 1 from public.team_members m join auth.users u on u.id=m.user_id where m.team_id=p_team_id and lower(u.email)=normalized) then raise exception 'User is already a team member' using errcode='23505'; end if;
  if exists(select 1 from public.invites i where i.team_id=p_team_id and lower(i.email)=normalized and i.status='pending' and i.expires_at>now()) then raise exception 'Invite already sent to this email' using errcode='23505'; end if;
  update public.invites set status='expired' where team_id=p_team_id and lower(email)=normalized and status='pending' and expires_at<=now();
  insert into public.invites(team_id,email,invited_by) values(p_team_id,normalized,auth.uid()) returning * into result;
  return result;
end $$;

create function public.accept_team_invite(p_token text) returns uuid language plpgsql security definer set search_path=public as $$
declare invitation public.invites; v_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select team_id into v_team_id from public.invites where token=p_token;
  perform 1 from public.teams where id=v_team_id for update;
  select * into invitation from public.invites where token=p_token for update;
  if not found or lower(invitation.email) is distinct from public.current_auth_email() then raise exception 'Invalid invitation' using errcode='42501'; end if;
  if invitation.status='accepted' and public.is_team_member(invitation.team_id) then return invitation.team_id; end if;
  if invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'Invalid or expired invitation' using errcode='22023'; end if;
  insert into public.team_members(team_id,user_id,role) values(invitation.team_id,auth.uid(),'member') on conflict(team_id,user_id) do nothing;
  update public.invites set status='accepted' where id=invitation.id;
  return invitation.team_id;
end $$;

drop policy "Activity log insert" on public.activity_log;
create policy "Activity log authorized insert" on public.activity_log for insert to authenticated with check(actor_id=auth.uid() and public.user_has_card_access(card_id));
create policy "Authors edit comments" on public.activity_log for update to authenticated using(actor_id=auth.uid() and action='commented' and public.user_has_card_access(card_id)) with check(actor_id=auth.uid() and action='commented' and public.user_has_card_access(card_id));
create policy "Authors delete comments" on public.activity_log for delete to authenticated using(actor_id=auth.uid() and action='commented' and public.user_has_card_access(card_id));
revoke update on public.activity_log from public,anon,authenticated;
grant update(changes) on public.activity_log to authenticated;

-- Reservations are charged even when the provider fails, so retries cannot evade the cap.
drop policy "AI usage own" on public.ai_usage;
create policy "AI usage own read" on public.ai_usage for select to authenticated using(user_id=auth.uid());
revoke insert,update,delete on public.ai_usage from public,anon,authenticated;
create function public.reserve_ai_usage(p_user_id uuid,p_feature text) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; used bigint; day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_user_id is null or p_feature is null or length(p_feature) not between 1 and 100 then raise exception 'Invalid quota reservation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||day_start::text,0));
  select count(*) into used from public.ai_usage where user_id=p_user_id and created_at>=day_start;
  if used>=50 then raise exception 'Daily AI limit reached' using errcode='P0001'; end if;
  insert into public.ai_usage(user_id,feature) values(p_user_id,p_feature) returning id into result;
  return result;
end $$;
revoke all on function public.reserve_ai_usage(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_usage(uuid,text) to service_role;

create function public.move_card(p_card_id uuid,p_column_id uuid,p_position integer,p_updates jsonb default '{}') returns public.cards language plpgsql security definer set search_path=public as $$
declare moved public.cards; target_count integer; requested integer;
begin
  if p_updates is null or jsonb_typeof(p_updates)<>'object' or
      p_updates-array['title','description','priority','due_date','start_date','assignee_id','recurrence_rule','cover_color']::text[]<>'{}'::jsonb then
    raise exception 'Unsupported card update fields' using errcode='22023';
  end if;
  select * into moved from public.cards where id=p_card_id;
  if not found or not public.user_has_board_access(moved.board_id) then raise exception 'Card not found or forbidden' using errcode='42501'; end if;
  perform 1 from public.boards where id=moved.board_id for update;
  select * into moved from public.cards where id=p_card_id for update;
  if not found then raise exception 'Card no longer exists' using errcode='22023'; end if;
  if not exists(select 1 from public.columns where id=p_column_id and board_id=moved.board_id) or p_position is null or p_position<0 then raise exception 'Invalid destination column or position' using errcode='22023'; end if;
  with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=moved.column_id and id<>p_card_id)
  update public.cards c set position=o.n from ordered o where c.id=o.id;
  if p_column_id<>moved.column_id then
    with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=p_column_id)
    update public.cards c set position=o.n from ordered o where c.id=o.id;
  end if;
  select count(*) into target_count from public.cards where column_id=p_column_id and id<>p_card_id;
  requested:=least(p_position,target_count);
  update public.cards set position=position+1 where column_id=p_column_id and id<>p_card_id and position>=requested;
  -- Metadata shares the move transaction. Cast/constraint failures roll back every reordered row.
  update public.cards set column_id=p_column_id,position=requested,updated_at=now(),
    title=case when p_updates?'title' then p_updates->>'title' else title end,
    description=case when p_updates?'description' then p_updates->>'description' else description end,
    priority=case when p_updates?'priority' then p_updates->>'priority' else priority end,
    due_date=case when p_updates?'due_date' then (p_updates->>'due_date')::timestamptz else due_date end,
    start_date=case when p_updates?'start_date' then (p_updates->>'start_date')::timestamptz else start_date end,
    assignee_id=case when p_updates?'assignee_id' then (p_updates->>'assignee_id')::uuid else assignee_id end,
    recurrence_rule=case when p_updates?'recurrence_rule' then p_updates->>'recurrence_rule' else recurrence_rule end,
    cover_color=case when p_updates?'cover_color' then p_updates->>'cover_color' else cover_color end
  where id=p_card_id returning * into moved;
  return moved;
end $$;

create function public.delete_board_column(p_board_id uuid,p_column_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare destination uuid; destination_count integer;
begin
  if not public.user_has_board_access(p_board_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  perform 1 from public.boards where id=p_board_id for update;
  if not exists(select 1 from public.columns where id=p_column_id and board_id=p_board_id) then raise exception 'Column not found' using errcode='22023'; end if;
  select id into destination from public.columns where board_id=p_board_id and id<>p_column_id order by position,id limit 1;
  if destination is null then raise exception 'Cannot delete the last column' using errcode='22023'; end if;
  with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=destination)
  update public.cards c set position=o.n from ordered o where c.id=o.id;
  select count(*) into destination_count from public.cards where column_id=destination;
  with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=p_column_id)
  update public.cards c set column_id=destination,position=destination_count+o.n from ordered o where c.id=o.id;
  delete from public.columns where id=p_column_id and board_id=p_board_id;
  return true;
end $$;
-- Prevent bypassing the preservation workflow through the exposed table API.
revoke delete on public.columns from public,anon,authenticated;

create function public.conversation_summaries() returns table(conversation_id uuid,last_message jsonb,unread_count bigint)
language sql security definer stable set search_path=public as $$
  select cm.conversation_id,
    (select to_jsonb(m) from public.messages m where m.conversation_id=cm.conversation_id order by m.created_at desc,m.id desc limit 1),
    (select count(*) from public.messages m where m.conversation_id=cm.conversation_id and m.sender_id<>auth.uid() and m.deleted_at is null and m.created_at>coalesce(cm.last_read_at,'-infinity'::timestamptz))
  from public.conversation_members cm where cm.user_id=auth.uid();
$$;

create function public.notification_recipient_allowed(p_card_id uuid,p_board_id uuid,p_actor_id uuid,p_recipient_id uuid) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.cards c where c.id=p_card_id and c.board_id=p_board_id)
     and exists(select 1 from public.boards b where b.id=p_board_id and (b.owner_id=p_actor_id or exists(select 1 from public.board_teams bt join public.team_members tm on tm.team_id=bt.team_id where bt.board_id=b.id and tm.user_id=p_actor_id)))
     and exists(select 1 from public.boards b where b.id=p_board_id and (b.owner_id=p_recipient_id or exists(select 1 from public.board_teams bt join public.team_members tm on tm.team_id=bt.team_id where bt.board_id=b.id and tm.user_id=p_recipient_id)));
$$;
revoke all on function public.notification_recipient_allowed(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_recipient_allowed(uuid,uuid,uuid,uuid) to service_role;

revoke all on function public.create_team(text),public.invite_team_member(uuid,text),public.accept_team_invite(text),public.move_card(uuid,uuid,integer,jsonb),public.delete_board_column(uuid,uuid),public.conversation_summaries() from public,anon;
grant execute on function public.create_team(text),public.invite_team_member(uuid,text),public.accept_team_invite(text),public.move_card(uuid,uuid,integer,jsonb),public.delete_board_column(uuid,uuid),public.conversation_summaries() to authenticated;

-- TRUNCATE bypasses RLS and is never an application-client operation.
revoke truncate on all tables in schema public,storage from public,anon,authenticated;
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;
commit;
