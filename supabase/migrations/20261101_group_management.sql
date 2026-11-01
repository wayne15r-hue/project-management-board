-- All group metadata/membership changes share the conversation row lock.
-- Existing unnamed groups and all chat content are deliberately preserved.
begin;
revoke delete on public.conversation_members from public, anon, authenticated;
drop policy if exists "Members delete own" on public.conversation_members;
revoke update on public.conversations from public, anon, authenticated;
drop policy if exists "Conversations update admins" on public.conversations;
drop policy if exists "Conversations update" on public.conversations;

create or replace function public.create_conversation(p_type text,p_name text,p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  normalized_name text := btrim(p_name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  members uuid[];
  result uuid;
begin
  if caller is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if p_type is null or p_type not in ('direct','group') then raise exception 'Invalid conversation type' using errcode='22023'; end if;
  if p_member_ids is null or cardinality(p_member_ids) not between 1 and 49
     or array_position(p_member_ids,null) is not null then
    raise exception 'Select 1–49 other members (50 total maximum)' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_member_ids) m where not exists(select 1 from public.profiles p where p.id=m)) then
    raise exception 'Invalid member profile' using errcode='22023';
  end if;
  select array_agg(distinct m order by m) into members from unnest(p_member_ids) m where m<>caller;
  if coalesce(cardinality(members),0)=0 then raise exception 'At least one other member required' using errcode='22023'; end if;
  if p_type='group' and (normalized_name is null or char_length(normalized_name) not between 1 and 100) then
    raise exception 'Group name must contain 1–100 characters' using errcode='22023';
  end if;
  if p_type='direct' then
    if cardinality(members)<>1 then raise exception 'Direct conversations require one other member' using errcode='22023'; end if;
    -- Pair lock also prevents two simultaneous DM creations from duplicating.
    perform pg_advisory_xact_lock(hashtextextended(least(caller::text,members[1]::text)||':'||greatest(caller::text,members[1]::text),0));
    select c.id into result from public.conversations c where c.type='direct'
      and exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=caller)
      and exists(select 1 from public.conversation_members where conversation_id=c.id and user_id=members[1])
      and (select count(*) from public.conversation_members where conversation_id=c.id)=2 limit 1;
    if result is not null then return result; end if;
  end if;
  insert into public.conversations(type,name,created_by) values(p_type,case when p_type='group' then normalized_name else null end,caller) returning id into result;
  insert into public.conversation_members(conversation_id,user_id,is_admin) values(result,caller,true);
  insert into public.conversation_members(conversation_id,user_id,is_admin) select result,m,false from unnest(members) m;
  return result;
end;
$$;
revoke all on function public.create_conversation(text,text,uuid[]) from public,anon;
grant execute on function public.create_conversation(text,text,uuid[]) to authenticated;

create or replace function public.manage_group(p_conversation_id uuid,p_action text,p_user_id uuid default null,p_name text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  kind text;
  caller_admin boolean;
  target uuid;
  target_admin boolean;
  normalized_name text := btrim(p_name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
  if caller is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select type into kind from public.conversations where id=p_conversation_id for update;
  if kind is null then raise exception 'Group not found' using errcode='P0002'; end if;
  if kind<>'group' then raise exception 'Only group conversations can be managed' using errcode='22023'; end if;
  if p_action is null or p_action not in ('rename','add','remove','promote','demote','leave') then raise exception 'Invalid group action' using errcode='22023'; end if;
  if p_action='leave' and p_user_id is not null and p_user_id<>caller then raise exception 'Leave can only target yourself' using errcode='22023'; end if;
  select is_admin into caller_admin from public.conversation_members where conversation_id=p_conversation_id and user_id=caller;
  if not found then
    if p_action='leave' then return; end if; -- Safe retry; never changes another membership.
    raise exception 'Forbidden: current group membership required' using errcode='42501';
  end if;
  if p_action<>'leave' and not coalesce(caller_admin,false) then raise exception 'Only admins can manage groups' using errcode='42501'; end if;
  if p_action='rename' then
    if normalized_name is null or char_length(normalized_name) not between 1 and 100 then raise exception 'Group name must contain 1–100 characters' using errcode='22023'; end if;
    update public.conversations set name=normalized_name,updated_at=clock_timestamp() where id=p_conversation_id;
    return;
  end if;
  target := case when p_action='leave' then caller else p_user_id end;
  if target is null then raise exception 'Member user ID is required' using errcode='22023'; end if;
  select is_admin into target_admin from public.conversation_members where conversation_id=p_conversation_id and user_id=target;
  if p_action='add' then
    if found then return; end if; -- Retried add must not demote an existing admin.
    if not exists(select 1 from public.profiles where id=target) then raise exception 'Invalid member profile' using errcode='22023'; end if;
    if (select count(*) from public.conversation_members where conversation_id=p_conversation_id)>=50 then raise exception 'Maximum 50 group members' using errcode='23514'; end if;
    insert into public.conversation_members(conversation_id,user_id,is_admin) values(p_conversation_id,target,false);
  else
    if not found then
      if p_action='remove' then return; end if;
      raise exception 'Group member not found' using errcode='22023';
    end if;
    if p_action in ('remove','leave','demote') and coalesce(target_admin,false)
      and (select count(*) from public.conversation_members where conversation_id=p_conversation_id and is_admin)=1 then
      raise exception 'The last admin must promote another member before leaving, being removed or being demoted' using errcode='23514';
    end if;
    if p_action in ('remove','leave') then
      delete from public.conversation_members where conversation_id=p_conversation_id and user_id=target;
    else
      update public.conversation_members set is_admin=(p_action='promote') where conversation_id=p_conversation_id and user_id=target;
    end if;
  end if;
  -- Existing conversation realtime subscription refreshes current members.
  update public.conversations set updated_at=clock_timestamp() where id=p_conversation_id;
end;
$$;
revoke all on function public.manage_group(uuid,text,uuid,text) from public,anon;
grant execute on function public.manage_group(uuid,text,uuid,text) to authenticated;

create or replace function public.group_details(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_conversation_member(p_conversation_id) then raise exception 'Forbidden: current group membership required' using errcode='42501'; end if;
  select jsonb_build_object('id',c.id,'name',c.name,'members',(
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'avatar_url',p.avatar_url,'is_admin',coalesce(m.is_admin,false)) order by m.is_admin desc,p.full_name,p.email),'[]'::jsonb)
    from public.conversation_members m join public.profiles p on p.id=m.user_id where m.conversation_id=c.id
  )) into result from public.conversations c where c.id=p_conversation_id and c.type='group';
  if result is null then raise exception 'Only group conversations have group details' using errcode='22023'; end if;
  return result;
end;
$$;
revoke all on function public.group_details(uuid) from public,anon;
grant execute on function public.group_details(uuid) to authenticated;
commit;
