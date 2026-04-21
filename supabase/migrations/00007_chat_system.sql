-- ============================================
-- Phase 5: Team chat (conversations, messages, reactions)
-- ============================================

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('direct', 'group', 'board')),
  name             text,
  board_id         uuid references public.boards(id) on delete cascade,
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_message_at  timestamptz
);

create table public.conversation_members (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  joined_at        timestamptz not null default now(),
  last_read_at     timestamptz default now(),
  is_admin         boolean default false,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id),
  content          text,
  message_type     text not null default 'text'
                     check (message_type in ('text', 'file', 'image', 'voice', 'system', 'card_link')),
  file_url         text,
  file_name        text,
  file_size        bigint,
  file_type        text,
  reply_to_id      uuid references public.messages(id),
  edited_at        timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now()
);

create table public.message_reactions (
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index idx_messages_conversation on public.messages(conversation_id, created_at desc);
create index idx_conversation_members_user on public.conversation_members(user_id);
create index idx_conversations_last_message on public.conversations(last_message_at desc nulls last);

-- Bump conversation.last_message_at on insert
create or replace function public.touch_conversation_on_message()
returns trigger as $$
begin
  update public.conversations
    set last_message_at = new.created_at,
        updated_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_touch_conversation_on_message
  after insert on public.messages
  for each row execute procedure public.touch_conversation_on_message();

-- ============================================
-- RLS
-- ============================================

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reactions    enable row level security;

-- Helper: is the caller a member of this conversation?
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

create policy "Conversations select"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "Conversations insert"
  on public.conversations for insert to authenticated
  with check (created_by = auth.uid());

create policy "Conversations update admins"
  on public.conversations for update to authenticated
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = conversations.id
        and user_id = auth.uid()
        and is_admin = true
    )
  );

create policy "Members select own"
  on public.conversation_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
  );

create policy "Members insert"
  on public.conversation_members for insert to authenticated
  with check (true);

create policy "Members update own"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid());

create policy "Members delete own"
  on public.conversation_members for delete to authenticated
  using (user_id = auth.uid());

create policy "Messages select"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Messages insert"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

create policy "Messages update own"
  on public.messages for update to authenticated
  using (sender_id = auth.uid());

create policy "Reactions all"
  on public.message_reactions for all to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  )
  with check (user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.conversations;

-- Chat attachments bucket (5MB limit)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 5242880, null)
on conflict (id) do nothing;

create policy "Chat files read"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-files');

create policy "Chat files upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files');
