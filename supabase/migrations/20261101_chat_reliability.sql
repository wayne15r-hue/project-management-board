-- Separate row ownership from conversation visibility. FOR ALL's INSERT
-- check and DELETE using clause previously allowed unauthorized reactions.
begin;
drop policy if exists "Reactions all" on public.message_reactions;
drop policy if exists "Reactions member read" on public.message_reactions;
drop policy if exists "Reactions own insert" on public.message_reactions;
drop policy if exists "Reactions own delete" on public.message_reactions;
create policy "Reactions member read" on public.message_reactions for select to authenticated
using (exists(select 1 from public.messages m where m.id=message_id and public.is_conversation_member(m.conversation_id)));
create policy "Reactions own insert" on public.message_reactions for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and m.deleted_at is null and public.is_conversation_member(m.conversation_id)));
create policy "Reactions own delete" on public.message_reactions for delete to authenticated
using (user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and public.is_conversation_member(m.conversation_id)));
-- A reaction is immutable; replace it with delete/insert instead.
revoke update on public.message_reactions from public, anon, authenticated;

-- Realtime private Presence authorization. The realtime schema/table are
-- Supabase-owned; do not ALTER their ownership or RLS settings here.
create or replace function public.can_access_chat_topic(p_topic text)
returns boolean language sql stable security definer set search_path=public as $$
  select case when p_topic ~ '^typing:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.is_conversation_member(substring(p_topic from 8)::uuid)
    else false end;
$$;
revoke all on function public.can_access_chat_topic(text) from public,anon;
grant execute on function public.can_access_chat_topic(text) to authenticated;
drop policy if exists "Chat typing member read" on realtime.messages;
drop policy if exists "Chat typing member write" on realtime.messages;
create policy "Chat typing member read" on realtime.messages for select to authenticated
using (extension='presence' and public.can_access_chat_topic(realtime.topic()));
create policy "Chat typing member write" on realtime.messages for insert to authenticated
with check (extension='presence' and public.can_access_chat_topic(realtime.topic()));

-- Bound read receipts to the message actually displayed. A delayed request
-- cannot mark a later message read or move the receipt backwards.
create or replace function public.mark_conversation_read(p_conversation_id uuid, p_message_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare boundary timestamptz;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select created_at into boundary from public.messages
  where conversation_id=p_conversation_id and deleted_at is null
    and (p_message_id is null or id=p_message_id)
  order by created_at desc,id desc limit 1;
  if boundary is null then
    if p_message_id is not null then raise exception 'Invalid message' using errcode='22023'; end if;
    return;
  end if;
  update public.conversation_members set last_read_at=greatest(last_read_at,boundary)
  where conversation_id=p_conversation_id and user_id=auth.uid();
end;
$$;
revoke all on function public.mark_conversation_read(uuid,uuid) from public,anon;
grant execute on function public.mark_conversation_read(uuid,uuid) to authenticated;
commit;
