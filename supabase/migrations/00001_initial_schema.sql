-- ============================================
-- Phase 1: Core tables (profiles, boards, columns, cards)
-- ============================================

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  avatar_url   text,
  email        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Boards
create table public.boards (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Columns
create table public.columns (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  name         text not null,
  position     integer not null,
  color        text,
  created_at   timestamptz not null default now()
);

-- Cards
create table public.cards (
  id           uuid primary key default gen_random_uuid(),
  column_id    uuid not null references public.columns(id) on delete cascade,
  board_id     uuid not null references public.boards(id) on delete cascade,
  title        text not null,
  description  text,
  priority     text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  position     integer not null,
  due_date     timestamptz,
  start_date   timestamptz,
  assignee_id  uuid references public.profiles(id) on delete set null,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indexes
create index idx_columns_board_id on public.columns(board_id);
create index idx_cards_column_id on public.cards(column_id);
create index idx_cards_board_id on public.cards(board_id);
create index idx_cards_assignee_id on public.cards(assignee_id);

-- ============================================
-- Row Level Security
-- ============================================

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.cards enable row level security;

-- Helper: does the user have access to this board?
create or replace function public.user_has_board_access(board_uuid uuid)
returns boolean as $$
  select exists (
    select 1 from public.boards where id = board_uuid and owner_id = auth.uid()
    union
    select 1
      from public.board_teams bt
      join public.team_members tm on tm.team_id = bt.team_id
     where bt.board_id = board_uuid
       and tm.user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Profiles: read any, update own
create policy "Profiles are viewable by authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "Users can insert own profile" on public.profiles
  for insert with check (id = auth.uid());
create policy "Users can update own profile" on public.profiles
  for update using (id = auth.uid());

-- Boards
create policy "Board select" on public.boards
  for select using (public.user_has_board_access(id));
create policy "Board insert" on public.boards
  for insert with check (owner_id = auth.uid());
create policy "Board update" on public.boards
  for update using (public.user_has_board_access(id));
create policy "Board delete" on public.boards
  for delete using (owner_id = auth.uid());

-- Columns
create policy "Column select" on public.columns
  for select using (public.user_has_board_access(board_id));
create policy "Column insert" on public.columns
  for insert with check (public.user_has_board_access(board_id));
create policy "Column update" on public.columns
  for update using (public.user_has_board_access(board_id));
create policy "Column delete" on public.columns
  for delete using (public.user_has_board_access(board_id));

-- Cards
create policy "Card select" on public.cards
  for select using (public.user_has_board_access(board_id));
create policy "Card insert" on public.cards
  for insert with check (public.user_has_board_access(board_id));
create policy "Card update" on public.cards
  for update using (public.user_has_board_access(board_id));
create policy "Card delete" on public.cards
  for delete using (public.user_has_board_access(board_id));

-- Enable realtime for cards and columns
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.columns;
