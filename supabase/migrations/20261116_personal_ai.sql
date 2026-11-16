begin;

create table if not exists public.personal_ai_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini','groq','openrouter')),
  version uuid not null,
  secret text not null,
  masked_key text not null default '••••',
  key_rejected boolean not null default false,
  model text not null,
  effort text not null default 'default',
  model_ids text[] not null,
  budget_micros bigint not null check (budget_micros between 10000 and 1000000000),
  expires_at timestamptz,
  provider_expires_at timestamptz,
  last_checked_at timestamptz not null,
  primary key (user_id, provider)
);

create table if not exists public.personal_ai_runs (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini','groq','openrouter')),
  model text not null,
  effort text not null,
  feature text not null,
  reserved_micros bigint not null check (reserved_micros > 0),
  cost_micros bigint check (cost_micros >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  total_tokens integer check (total_tokens >= 0),
  reasoning_tokens integer check (reasoning_tokens >= 0),
  status text not null default 'pending' check (status in ('pending','reported','unavailable','rejected')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists personal_ai_runs_month_idx
  on public.personal_ai_runs(user_id, created_at desc, provider);

alter table public.personal_ai_connections enable row level security;
alter table public.personal_ai_runs enable row level security;
revoke all on public.personal_ai_connections, public.personal_ai_runs from public, anon, authenticated;
grant select, insert, update, delete on public.personal_ai_connections to service_role;
grant select, insert, update on public.personal_ai_runs to service_role;

create or replace function public.reserve_personal_ai_run(
  p_user uuid, p_provider text, p_version uuid, p_id uuid, p_model text,
  p_effort text, p_feature text, p_reserve bigint
) returns text
language plpgsql set search_path = ''
as $$
declare
  connection public.personal_ai_connections%rowtype;
  started timestamptz;
  used bigint;
begin
  -- The connection row serializes reservations and key changes for one user/provider.
  select * into connection from public.personal_ai_connections
    where user_id = p_user and provider = p_provider for update;
  if not found then raise exception 'connection_missing'; end if;
  if connection.version <> p_version then raise exception 'connection_changed'; end if;
  if connection.key_rejected then raise exception 'key_rejected'; end if;
  started := clock_timestamp();
  if connection.expires_at <= started or connection.provider_expires_at <= started
    then raise exception 'connection_expired'; end if;
  if not (p_model = any(connection.model_ids)) then raise exception 'model_unavailable'; end if;
  if exists(select 1 from public.personal_ai_runs where user_id = p_user and id = p_id)
    then raise exception 'duplicate_run'; end if;
  select coalesce(sum(coalesce(cost_micros, reserved_micros)),0) into used
    from public.personal_ai_runs
    where user_id = p_user and provider = p_provider
      and created_at >= (date_trunc('month', started at time zone 'UTC') at time zone 'UTC');
  if used + p_reserve > connection.budget_micros then raise exception 'budget_exceeded'; end if;
  insert into public.personal_ai_runs(id,user_id,provider,model,effort,feature,reserved_micros,created_at)
    values(p_id,p_user,p_provider,p_model,p_effort,p_feature,p_reserve,started);
  return connection.secret;
exception when unique_violation then raise exception 'duplicate_run';
end;
$$;

create or replace function public.personal_ai_month(p_user uuid)
returns table(provider text, model text, runs bigint, input_tokens bigint, output_tokens bigint,
  total_tokens bigint, reasoning_tokens bigint, unknown_runs bigint, cost_micros bigint, pending_micros bigint)
language sql stable set search_path = ''
as $$
  select r.provider, r.model, count(*), sum(r.input_tokens), sum(r.output_tokens), sum(r.total_tokens),
    sum(r.reasoning_tokens), count(*) filter (where r.total_tokens is null and r.status <> 'rejected'),
    coalesce(sum(r.cost_micros),0), coalesce(sum(r.reserved_micros) filter (where r.cost_micros is null),0)
  from public.personal_ai_runs r
  where r.user_id = p_user and r.created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
  group by r.provider,r.model;
$$;

revoke all on function public.reserve_personal_ai_run(uuid,text,uuid,uuid,text,text,text,bigint) from public, anon, authenticated;
revoke all on function public.personal_ai_month(uuid) from public, anon, authenticated;
grant execute on function public.reserve_personal_ai_run(uuid,text,uuid,uuid,text,text,text,bigint) to service_role;
grant execute on function public.personal_ai_month(uuid) to service_role;

commit;
