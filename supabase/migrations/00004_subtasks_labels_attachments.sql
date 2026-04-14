-- ============================================
-- Phase 4: Subtasks, labels, attachments
-- ============================================
-- NOTE: Create a Supabase Storage bucket named "attachments" in the dashboard
-- (public = false) for file uploads to work.

-- ---------- Subtasks ----------
create table public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.cards(id) on delete cascade,
  title       text not null,
  completed   boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index idx_subtasks_card_id on public.subtasks(card_id);
alter table public.subtasks enable row level security;
create policy "Subtask access" on public.subtasks
  for all to authenticated
  using (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and (
          c.created_by = auth.uid()
          or exists (
            select 1 from public.boards b
            where b.id = c.board_id and b.owner_id = auth.uid()
          )
          or exists (
            select 1 from public.board_teams bt
            join public.team_members tm on tm.team_id = bt.team_id
            where bt.board_id = c.board_id and tm.user_id = auth.uid()
          )
        )
    )
  );

-- ---------- Labels ----------
create table public.labels (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards(id) on delete cascade,
  name        text not null,
  color       text not null default '#6366f1',
  created_at  timestamptz not null default now()
);
create index idx_labels_board_id on public.labels(board_id);

create table public.card_labels (
  card_id   uuid not null references public.cards(id) on delete cascade,
  label_id  uuid not null references public.labels(id) on delete cascade,
  primary key (card_id, label_id)
);
create index idx_card_labels_card_id on public.card_labels(card_id);
create index idx_card_labels_label_id on public.card_labels(label_id);

alter table public.labels enable row level security;
alter table public.card_labels enable row level security;

create policy "Labels access" on public.labels
  for all to authenticated using (true) with check (true);
create policy "Card labels access" on public.card_labels
  for all to authenticated using (true) with check (true);

-- ---------- Attachments ----------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.cards(id) on delete cascade,
  file_name     text not null,
  file_size     bigint not null,
  file_type     text not null,
  storage_path  text not null,
  uploaded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_attachments_card_id on public.attachments(card_id);
alter table public.attachments enable row level security;
create policy "Attachments access" on public.attachments
  for all to authenticated using (true) with check (true);
