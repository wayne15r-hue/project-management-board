-- Add recurrence columns to cards table
alter table public.cards add column if not exists recurrence_rule text;
alter table public.cards add column if not exists recurrence_parent_id uuid references public.cards(id);
