-- ============================================
-- Phase 3: Teams, invites, activity log
-- ============================================

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table public.team_members (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at    timestamptz not null default now(),
  unique(team_id, user_id)
);

create table public.board_teams (
  board_id     uuid not null references public.boards(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  primary key (board_id, team_id)
);

create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  email        text not null,
  invited_by   uuid not null references public.profiles(id),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  token        text not null unique default gen_random_uuid()::text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days'
);

create table public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards(id) on delete cascade,
  actor_id     uuid not null references public.profiles(id),
  action       text not null,
  changes      jsonb,
  created_at   timestamptz not null default now()
);

create index idx_activity_log_card_id on public.activity_log(card_id);
create index idx_team_members_team on public.team_members(team_id);
create index idx_team_members_user on public.team_members(user_id);
create index idx_invites_token on public.invites(token);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.board_teams enable row level security;
alter table public.invites enable row level security;
alter table public.activity_log enable row level security;

-- Teams: members can view, creator manages
create policy "Team select" on public.teams
  for select using (
    exists (select 1 from public.team_members where team_id = id and user_id = auth.uid())
  );
create policy "Team insert" on public.teams
  for insert with check (created_by = auth.uid());

-- Team members
create policy "Team members select" on public.team_members
  for select using (
    exists (select 1 from public.team_members tm where tm.team_id = team_id and tm.user_id = auth.uid())
  );
create policy "Team members manage" on public.team_members
  for insert with check (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  );

-- Board teams
create policy "Board teams access" on public.board_teams
  for all using (public.user_has_board_access(board_id));

-- Invites
create policy "Invites select" on public.invites
  for select using (
    email = (select email from public.profiles where id = auth.uid())
    or invited_by = auth.uid()
  );
create policy "Invites insert" on public.invites
  for insert with check (invited_by = auth.uid());

-- Activity log
create policy "Activity log read" on public.activity_log
  for select using (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and public.user_has_board_access(c.board_id)
    )
  );
create policy "Activity log insert" on public.activity_log
  for insert with check (actor_id = auth.uid());
