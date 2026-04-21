-- AI Assistant: BYOK API keys, usage tracking, AI-generated card metadata.

alter table public.profiles
  add column if not exists anthropic_api_key text;

alter table public.profiles
  add column if not exists ai_enabled boolean not null default false;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_created
  on public.ai_usage(user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "AI usage own" on public.ai_usage;
create policy "AI usage own" on public.ai_usage
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.cards
  add column if not exists ai_generated boolean not null default false;

alter table public.cards
  add column if not exists ai_metadata jsonb;
