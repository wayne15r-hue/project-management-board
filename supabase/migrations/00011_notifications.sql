-- Notifications table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('assignment', 'mention', 'comment')),
  card_id uuid references public.cards(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  activity_log_id uuid references public.activity_log(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient_unread
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

create index idx_notifications_recipient_all
  on public.notifications(recipient_id, created_at desc);

alter table public.notifications enable row level security;

-- Recipients see their own notifications
create policy "Notifications select own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

-- Recipients can mark their own as read (update read_at)
create policy "Notifications update own" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Inserts go through server-side code with service role; no insert policy for authenticated
-- (service role bypasses RLS automatically)

-- Realtime publication
alter publication supabase_realtime add table public.notifications;

-- Profile email preference
alter table public.profiles
  add column if not exists email_notifications boolean not null default true;
