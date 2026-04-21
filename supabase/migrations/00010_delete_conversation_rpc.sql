-- Admin-only conversation deletion. Cascades to members + messages via FK.
create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin
  from public.conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();

  if not coalesce(v_is_admin, false) then
    raise exception 'Only admins can delete conversations';
  end if;

  delete from public.conversations where id = p_conversation_id;
  return true;
end;
$$;

grant execute on function public.delete_conversation(uuid) to authenticated;
