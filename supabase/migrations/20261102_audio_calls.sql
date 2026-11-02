-- Audio metadata stays in Supabase; only opaque room and user IDs reach LiveKit.
begin;
create table if not exists public.audio_calls (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 caller_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('direct','group')),
 state text not null check(state in ('ringing','active','ended')),
 end_reason text check(end_reason in ('ended','cancelled','declined','missed','busy','abandoned','removed')),
 created_at timestamptz not null default clock_timestamp(),
 started_at timestamptz,
 ended_at timestamptz
);
create unique index if not exists audio_calls_one_live on public.audio_calls(conversation_id) where state<>'ended';
create table if not exists public.audio_call_participants (
 call_id uuid not null references public.audio_calls(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 media_identity uuid not null default gen_random_uuid(),
 state text not null check(state in ('invited','joined','left','declined')),
 blocked boolean not null default false,
 heartbeat_at timestamptz not null default clock_timestamp(),
 primary key(call_id,user_id)
);
create table if not exists public.audio_media_cleanup (
 id uuid primary key default gen_random_uuid(),
 position bigint generated always as identity,
 room_name text not null,
 identity text,
 created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.audio_cleanup_lease(singleton boolean primary key default true check(singleton),owner uuid,expires_at timestamptz not null default '-infinity');
insert into public.audio_cleanup_lease(singleton) values(true) on conflict do nothing;
alter table public.audio_cleanup_lease enable row level security;
revoke all on public.audio_cleanup_lease from public,anon,authenticated;
grant all on public.audio_cleanup_lease to service_role;
create or replace function public.audio_cleanup_claim() returns uuid language plpgsql security definer set search_path=public as $$
declare lease uuid;
begin
 update public.audio_cleanup_lease set owner=gen_random_uuid(),expires_at=clock_timestamp()+interval '45 seconds' where expires_at<clock_timestamp() returning owner into lease;
 return lease;
end;$$;
create or replace function public.audio_cleanup_release(p_owner uuid) returns void language sql security definer set search_path=public as $$update public.audio_cleanup_lease set expires_at='-infinity',owner=null where owner=p_owner$$;
alter table public.audio_calls enable row level security;
alter table public.audio_call_participants enable row level security;
alter table public.audio_media_cleanup enable row level security;
revoke all on public.audio_calls,public.audio_call_participants,public.audio_media_cleanup from public,anon,authenticated;
grant select on public.audio_calls,public.audio_call_participants to authenticated;
grant all on public.audio_calls,public.audio_call_participants,public.audio_media_cleanup to service_role;
drop policy if exists "Audio current members" on public.audio_calls;
create policy "Audio current members" on public.audio_calls for select to authenticated using(public.is_conversation_member(conversation_id));
drop policy if exists "Audio participant visibility" on public.audio_call_participants;
create policy "Audio participant visibility" on public.audio_call_participants for select to authenticated using(exists(select 1 from public.audio_calls c where c.id=call_id));

create or replace function public.audio_media_end() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' or (new.state='ended' and old.state<>'ended') then
  insert into public.audio_media_cleanup(room_name,identity) select 'helios-'||old.id::text,p.media_identity::text from public.audio_call_participants p where p.call_id=old.id;
  insert into public.audio_media_cleanup(room_name) values('helios-'||old.id::text);
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;$$;
drop trigger if exists audio_media_end on public.audio_calls;
drop trigger if exists audio_media_end_update on public.audio_calls;
drop trigger if exists audio_media_end_delete on public.audio_calls;
create trigger audio_media_end_update after update on public.audio_calls for each row execute function public.audio_media_end();
create trigger audio_media_end_delete before delete on public.audio_calls for each row execute function public.audio_media_end();

create or replace function public.audio_member_removed() returns trigger language plpgsql security definer set search_path=public as $$
declare c record;
begin
 for c in select a.id,a.kind from public.audio_calls a where a.conversation_id=old.conversation_id and a.state<>'ended' loop
  update public.audio_call_participants set state='left',blocked=true where call_id=c.id and user_id=old.user_id;
  insert into public.audio_media_cleanup(room_name,identity) select 'helios-'||c.id::text,media_identity::text from public.audio_call_participants where call_id=c.id and user_id=old.user_id;
  if c.kind='direct' or not exists(select 1 from public.audio_call_participants where call_id=c.id and state='joined') then
   update public.audio_calls set state='ended',end_reason='removed',ended_at=clock_timestamp() where id=c.id;
  end if;
 end loop;
 return old;
end;$$;
drop trigger if exists audio_member_removed on public.conversation_members;
create trigger audio_member_removed after delete on public.conversation_members for each row execute function public.audio_member_removed();

create or replace function public.audio_expire() returns void language plpgsql security definer set search_path=public as $$
declare expired record;
begin
 for expired in select a.call_id id,a.user_id,a.media_identity from public.audio_call_participants a join public.audio_calls c on c.id=a.call_id where c.state<>'ended' and a.state='joined' and a.heartbeat_at<clock_timestamp()-interval '60 seconds' loop
  update public.audio_call_participants set state='left' where call_id=expired.id and user_id=expired.user_id;
  insert into public.audio_media_cleanup(room_name,identity) values('helios-'||expired.id::text,expired.media_identity::text);
 end loop;
 update public.audio_calls set state='ended',end_reason='missed',ended_at=clock_timestamp() where state='ringing' and created_at<clock_timestamp()-interval '45 seconds';
 update public.audio_calls c set state='ended',end_reason='abandoned',ended_at=clock_timestamp()
 where state<>'ended' and not exists(select 1 from public.audio_call_participants p where p.call_id=c.id and p.state='joined');
end;$$;

create or replace function public.audio_maintenance() returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(71420261102);perform public.audio_expire();
end;$$;

create or replace function public.audio_call_view(p_call_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 select to_jsonb(c)||jsonb_build_object(
 'caller_name',(select coalesce(full_name,email) from public.profiles where id=c.caller_id),
 'title',coalesce((select name from public.conversations where id=c.conversation_id),'Audio call'),
 'current_user_is_admin',coalesce((select is_admin from public.conversation_members where conversation_id=c.conversation_id and user_id=auth.uid()),false),
 'participants',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('display_name',coalesce(profile.full_name,profile.email)) order by p.user_id) from public.audio_call_participants p join public.profiles profile on profile.id=p.user_id where p.call_id=c.id),'[]'::jsonb)) into result
 from public.audio_calls c where c.id=p_call_id and public.is_conversation_member(c.conversation_id);
 if result is null then raise exception 'Forbidden: current conversation membership required' using errcode='42501';end if;
 return result;
end;$$;

create or replace function public.audio_call_list(p_conversation_id uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501';end if;
 perform pg_advisory_xact_lock(71420261102);perform public.audio_expire();
 select coalesce(jsonb_agg(v order by created desc),'[]'::jsonb) into result from (
  select public.audio_call_view(c.id) v,c.created_at created from public.audio_calls c
  where public.is_conversation_member(c.conversation_id) and
   ((p_conversation_id is null and c.state<>'ended' and exists(select 1 from public.audio_call_participants p where p.call_id=c.id and p.user_id=auth.uid() and not p.blocked and p.state in ('joined','invited')))
    or c.conversation_id=p_conversation_id)
  order by c.created_at desc limit 20
 ) s;
 return result;
end;$$;

create or replace function public.audio_call_start(p_conversation_id uuid,p_allow_group boolean default true) returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); kind text; call_id uuid; busy boolean;
begin
 -- Conversation lock precedes call serialization, as in group management.
 select c.type into kind from public.conversations c where c.id=p_conversation_id for update;
 if not public.is_conversation_member(p_conversation_id) then raise exception 'Forbidden: current conversation membership required' using errcode='42501';end if;
 if kind not in ('direct','group') then raise exception 'Audio supports direct and group chats' using errcode='22023';end if;
 if kind='group' and not coalesce(p_allow_group,false) then raise exception 'Group audio is not enabled yet' using errcode='22023';end if;
 perform pg_advisory_xact_lock(71420261102);perform public.audio_expire();
 select id into call_id from public.audio_calls where conversation_id=p_conversation_id and state<>'ended';
 if call_id is not null then return public.audio_call_view(call_id);end if;
 if exists(select 1 from public.audio_call_participants p join public.audio_calls c on c.id=p.call_id where p.user_id=caller and p.state='joined' and c.state<>'ended') then raise exception 'You are already in another call' using errcode='23514';end if;
 if (select count(*) from public.conversation_members where conversation_id=p_conversation_id)<2 then raise exception 'At least two members are required' using errcode='22023';end if;
 busy:=kind='direct' and exists(select 1 from public.audio_call_participants p join public.audio_calls c on c.id=p.call_id join public.conversation_members m on m.user_id=p.user_id and m.conversation_id=p_conversation_id where p.user_id<>caller and (p.state='joined' or (p.state='invited' and c.kind='direct' and c.state='ringing')) and c.state<>'ended');
 insert into public.audio_calls(conversation_id,caller_id,kind,state,end_reason,started_at,ended_at)
 values(p_conversation_id,caller,kind,case when busy then 'ended' when kind='group' then 'active' else 'ringing' end,case when busy then 'busy' end,case when kind='group' and not busy then clock_timestamp() end,case when busy then clock_timestamp() end) returning id into call_id;
 insert into public.audio_call_participants(call_id,user_id,state)
 select call_id,user_id,case when busy then 'left' when user_id=caller then 'joined' else 'invited' end from public.conversation_members where conversation_id=p_conversation_id;
 return public.audio_call_view(call_id);
end;$$;

create or replace function public.audio_call_action(p_call_id uuid,p_action text,p_target_id uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); c public.audio_calls; p public.audio_call_participants; conv uuid; admin boolean;
begin
 select conversation_id into conv from public.audio_calls where id=p_call_id;
 perform 1 from public.conversations where id=conv for update;
 if not public.is_conversation_member(conv) then raise exception 'Forbidden: current conversation membership required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(71420261102);perform public.audio_expire();
 select * into c from public.audio_calls where id=p_call_id for update;
 select * into p from public.audio_call_participants where call_id=p_call_id and user_id=caller;
 select is_admin into admin from public.conversation_members where conversation_id=conv and user_id=caller;
 if p_action is null or p_action not in ('join','decline','cancel','leave','end','heartbeat','kick') then raise exception 'Invalid call action' using errcode='22023';end if;
 if p_target_id is not null and p_action<>'kick' then raise exception 'Only moderation can target another user' using errcode='22023';end if;
 if p.blocked then raise exception 'You were removed from this call' using errcode='42501';end if;
 if c.state='ended' then
  if p_action in ('leave','end','cancel','decline','heartbeat') and p.user_id is not null then return public.audio_call_view(p_call_id);end if;
  raise exception 'Call has ended' using errcode='23514';
 end if;
 if p_action='join' then
  if c.kind='direct' and p.user_id is null then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from public.audio_call_participants a join public.audio_calls b on b.id=a.call_id where a.user_id=caller and a.state='joined' and b.state<>'ended' and b.id<>p_call_id) then raise exception 'You are already in another call' using errcode='23514';end if;
  insert into public.audio_call_participants(call_id,user_id,state) values(p_call_id,caller,'joined') on conflict(call_id,user_id) do update set state='joined',heartbeat_at=clock_timestamp(),media_identity=case when audio_call_participants.state in ('joined','invited') then audio_call_participants.media_identity else gen_random_uuid() end;
  if c.kind='group' or caller<>c.caller_id then update public.audio_calls set state='active',started_at=coalesce(started_at,clock_timestamp()) where id=p_call_id;end if;
 elsif p_action='heartbeat' then
  if p.state is distinct from 'joined' then raise exception 'Join or accept the call first' using errcode='42501';end if;
  update public.audio_call_participants set heartbeat_at=clock_timestamp() where call_id=p_call_id and user_id=caller;
 elsif p_action='kick' then
  if c.kind<>'group' or not coalesce(admin,false) or p_target_id is null or p_target_id=caller then raise exception 'Only group admins can remove other call participants' using errcode='42501';end if;
  update public.audio_call_participants set blocked=true,state='left' where call_id=p_call_id and user_id=p_target_id;
  insert into public.audio_media_cleanup(room_name,identity) select 'helios-'||p_call_id::text,media_identity::text from public.audio_call_participants where call_id=p_call_id and user_id=p_target_id;
 elsif p_action='end' then
  if caller<>c.caller_id and not coalesce(admin,false) then raise exception 'Only caller or group admins can end for everyone' using errcode='42501';end if;
  update public.audio_calls set state='ended',end_reason='ended',ended_at=clock_timestamp() where id=p_call_id;
 elsif p_action='cancel' then
  if caller<>c.caller_id or c.state<>'ringing' then raise exception 'Only caller can cancel ringing call' using errcode='42501';end if;
  update public.audio_calls set state='ended',end_reason='cancelled',ended_at=clock_timestamp() where id=p_call_id;
 elsif p_action='decline' then
  if caller=c.caller_id or p.state is distinct from 'invited' then raise exception 'Only invited recipient can decline' using errcode='42501';end if;
  update public.audio_call_participants set state='declined' where call_id=p_call_id and user_id=caller;
  if c.kind='direct' then update public.audio_calls set state='ended',end_reason='declined',ended_at=clock_timestamp() where id=p_call_id;end if;
 else
  if p.user_id is null then raise exception 'Join the call first' using errcode='42501';end if;
  update public.audio_call_participants set state='left' where call_id=p_call_id and user_id=caller;
  insert into public.audio_media_cleanup(room_name,identity) values('helios-'||p_call_id::text,p.media_identity::text);
  if c.kind='direct' or not exists(select 1 from public.audio_call_participants where call_id=p_call_id and state='joined') then
   update public.audio_calls set state='ended',end_reason=case when c.state='ringing' then 'cancelled' else 'ended' end,ended_at=clock_timestamp() where id=p_call_id;
  end if;
 end if;
 return public.audio_call_view(p_call_id);
end;$$;

create or replace function public.audio_call_access(p_call_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.audio_calls; conv uuid;
begin
 select conversation_id into conv from public.audio_calls where id=p_call_id;
 perform 1 from public.conversations where id=conv for update;
 if not public.is_conversation_member(conv) then raise exception 'Forbidden: current conversation membership required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(71420261102);perform public.audio_expire();
 select * into c from public.audio_calls where id=p_call_id;
 if c.state='ended' or not exists(select 1 from public.audio_call_participants where call_id=p_call_id and user_id=auth.uid() and state='joined' and not blocked) then raise exception 'Join or accept the call first' using errcode='42501';end if;
 return jsonb_build_object('room','helios-'||c.id::text,'kind',c.kind,'identity',(select media_identity::text from public.audio_call_participants where call_id=p_call_id and user_id=auth.uid()));
end;$$;
revoke all on function public.audio_media_end(),public.audio_member_removed(),public.audio_expire(),public.audio_call_view(uuid) from public,anon,authenticated;
revoke all on function public.audio_call_list(uuid),public.audio_call_start(uuid,boolean),public.audio_call_action(uuid,text,uuid),public.audio_call_access(uuid) from public,anon;
grant execute on function public.audio_call_list(uuid),public.audio_call_start(uuid,boolean),public.audio_call_action(uuid,text,uuid),public.audio_call_access(uuid) to authenticated;
revoke all on function public.audio_cleanup_claim(),public.audio_cleanup_release(uuid),public.audio_maintenance() from public,anon,authenticated;
grant execute on function public.audio_cleanup_claim(),public.audio_cleanup_release(uuid),public.audio_maintenance() to service_role;
commit;
