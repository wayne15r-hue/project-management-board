-- Board background themes, card cover colors, favorites, avatars bucket

-- Board background theme
alter table public.boards
  add column if not exists background_theme text;

-- Card cover color (hex string)
alter table public.cards
  add column if not exists cover_color text;

-- Favorite boards (local per-user)
create table if not exists public.board_favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  board_id   uuid not null references public.boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, board_id)
);

alter table public.board_favorites enable row level security;

drop policy if exists "Favorites select own" on public.board_favorites;
create policy "Favorites select own" on public.board_favorites
  for select using (user_id = auth.uid());

drop policy if exists "Favorites insert own" on public.board_favorites;
create policy "Favorites insert own" on public.board_favorites
  for insert with check (user_id = auth.uid());

drop policy if exists "Favorites delete own" on public.board_favorites;
create policy "Favorites delete own" on public.board_favorites
  for delete using (user_id = auth.uid());

-- Avatars storage bucket
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

-- Public read for avatar images
drop policy if exists "Avatars public read" on storage.objects;
create policy "Avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Users can upload their own avatar under their user id prefix
drop policy if exists "Avatars user upload" on storage.objects;
create policy "Avatars user upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatars user update" on storage.objects;
create policy "Avatars user update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatars user delete" on storage.objects;
create policy "Avatars user delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
