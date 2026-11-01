begin;

-- Repair installations that received hardening without personalization.
-- Keep this additive: do not replay the historical storage bucket policies.
alter table public.cards add column if not exists cover_color text;

create table if not exists public.board_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, board_id)
);
alter table public.board_favorites enable row level security;

drop policy if exists "Favorites select own" on public.board_favorites;
drop policy if exists "Favorites insert own" on public.board_favorites;
drop policy if exists "Favorites delete own" on public.board_favorites;
create policy "Favorites select own" on public.board_favorites
  for select to authenticated using (user_id = auth.uid());
create policy "Favorites insert own" on public.board_favorites
  for insert to authenticated with check (
    user_id = auth.uid() and public.user_has_board_access(board_id)
  );
create policy "Favorites delete own" on public.board_favorites
  for delete to authenticated using (user_id = auth.uid());

-- New tables can inherit broad Supabase default grants, including TRUNCATE.
revoke all on public.board_favorites from public, anon, authenticated;
grant select, insert, delete on public.board_favorites to authenticated;
grant all on public.board_favorites to service_role;

notify pgrst, 'reload schema';
commit;
