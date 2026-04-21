-- Safety-net migration: ensure boards.background_theme exists.
-- (Also defined in 20260419_personalization.sql; this file is idempotent
-- so applying both is safe.)

alter table public.boards
  add column if not exists background_theme text default 'default';
