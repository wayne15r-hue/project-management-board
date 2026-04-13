-- ============================================
-- Phase 2: Custom fields
-- ============================================

create table public.custom_field_definitions (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  name         text not null,
  field_type   text not null check (field_type in ('text', 'number', 'date', 'select')),
  options      jsonb,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create table public.custom_field_values (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards(id) on delete cascade,
  field_id     uuid not null references public.custom_field_definitions(id) on delete cascade,
  value        jsonb not null,
  unique(card_id, field_id)
);

create index idx_custom_field_defs_board on public.custom_field_definitions(board_id);
create index idx_custom_field_vals_card on public.custom_field_values(card_id);

alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;

create policy "Custom field def access" on public.custom_field_definitions
  for all using (public.user_has_board_access(board_id));

create policy "Custom field value access" on public.custom_field_values
  for all using (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and public.user_has_board_access(c.board_id)
    )
  );
