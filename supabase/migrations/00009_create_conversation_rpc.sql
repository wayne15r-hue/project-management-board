-- Atomic conversation creation with DM dedupe
create or replace function public.create_conversation(
  p_type text,
  p_name text,
  p_member_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_user_id uuid;
  v_member_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_type not in ('direct', 'group') then
    raise exception 'Invalid conversation type';
  end if;

  if p_member_ids is null or array_length(p_member_ids, 1) is null then
    raise exception 'At least one member required';
  end if;

  -- DM dedupe
  if p_type = 'direct' and array_length(p_member_ids, 1) = 1 then
    select c.id into v_conversation_id
    from public.conversations c
    where c.type = 'direct'
      and exists (
        select 1 from public.conversation_members
        where conversation_id = c.id and user_id = v_user_id
      )
      and exists (
        select 1 from public.conversation_members
        where conversation_id = c.id and user_id = p_member_ids[1]
      )
      and (select count(*) from public.conversation_members where conversation_id = c.id) = 2
    limit 1;

    if v_conversation_id is not null then
      return v_conversation_id;
    end if;
  end if;

  insert into public.conversations (type, name, created_by)
  values (p_type, case when p_type = 'group' then p_name else null end, v_user_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, is_admin)
  values (v_conversation_id, v_user_id, true);

  foreach v_member_id in array p_member_ids loop
    if v_member_id != v_user_id then
      insert into public.conversation_members (conversation_id, user_id, is_admin)
      values (v_conversation_id, v_member_id, false)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_conversation(text, text, uuid[]) to authenticated;
