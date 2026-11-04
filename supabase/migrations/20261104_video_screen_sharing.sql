begin;
alter table public.audio_calls add column if not exists initial_mode text not null default 'audio' check(initial_mode in ('audio','video'));
create or replace function public.audio_call_view(p_call_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 select to_jsonb(c)||jsonb_build_object(
 'initialMode',c.initial_mode,'caller_name',(select coalesce(full_name,email) from public.profiles where id=c.caller_id),
 'title',coalesce((select name from public.conversations where id=c.conversation_id),'Audio call'),
 'current_user_is_admin',coalesce((select is_admin from public.conversation_members where conversation_id=c.conversation_id and user_id=auth.uid()),false),
 'participants',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('display_name',coalesce(profile.full_name,profile.email)) order by p.user_id) from public.audio_call_participants p join public.profiles profile on profile.id=p.user_id where p.call_id=c.id),'[]'::jsonb)) into result
 from public.audio_calls c where c.id=p_call_id and public.is_conversation_member(c.conversation_id);
 if result is null then raise exception 'Forbidden: current conversation membership required' using errcode='42501';end if;
 return result;
end;$$;
create or replace function public.audio_call_start(p_conversation_id uuid,p_allow_group boolean,p_initial_mode text) returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); kind text; call_id uuid; busy boolean;
begin
 if p_initial_mode is null or p_initial_mode not in ('audio','video') then raise exception 'Invalid initial call mode' using errcode='22023';end if;
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
 insert into public.audio_calls(conversation_id,caller_id,kind,initial_mode,state,end_reason,started_at,ended_at)
 values(p_conversation_id,caller,kind,p_initial_mode,case when busy then 'ended' when kind='group' then 'active' else 'ringing' end,case when busy then 'busy' end,case when kind='group' and not busy then clock_timestamp() end,case when busy then clock_timestamp() end) returning id into call_id;
 insert into public.audio_call_participants(call_id,user_id,state)
 select call_id,user_id,case when busy then 'left' when user_id=caller then 'joined' else 'invited' end from public.conversation_members where conversation_id=p_conversation_id;
 return public.audio_call_view(call_id);
end;$$;
-- Keep the legacy signature and defaults; the new overload requires all arguments.
create or replace function public.audio_call_start(p_conversation_id uuid,p_allow_group boolean default true) returns jsonb language sql security definer set search_path=public as $$
 select public.audio_call_start(p_conversation_id,p_allow_group,'audio');
$$;
revoke all on function public.audio_call_start(uuid,boolean,text) from public,anon;
grant execute on function public.audio_call_start(uuid,boolean,text) to authenticated;
commit;
