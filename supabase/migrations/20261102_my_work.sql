-- Additive migration: deploy before the My Work client. Old writes remain valid.
begin;
alter table public.cards add column if not exists is_blocked boolean not null default false;
alter table public.cards add column if not exists blocked_reason text;

create or replace function public.normalize_card_block() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.is_blocked then
    new.blocked_reason:=regexp_replace(new.blocked_reason,'^[[:space:]]+|[[:space:]]+$','','g');
    if new.blocked_reason is null or length(new.blocked_reason) not between 1 and 500 then
      raise exception 'Blocked reason must contain 1 to 500 characters' using errcode='22023';
    end if;
  else new.blocked_reason:=null;
  end if;
  return new;
end $$;
drop trigger if exists normalize_card_block on public.cards;
create trigger normalize_card_block before insert or update on public.cards
for each row execute function public.normalize_card_block();

create or replace function public.record_card_block() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and (
    (tg_op='INSERT' and new.is_blocked) or
    (tg_op='UPDATE' and (old.is_blocked is distinct from new.is_blocked or old.blocked_reason is distinct from new.blocked_reason))) then
    insert into public.activity_log(card_id,actor_id,action,changes)
    values(new.id,auth.uid(),case when new.is_blocked then 'blocked' else 'unblocked' end,
      jsonb_build_object('blocked_reason',new.blocked_reason));
  end if;
  return new;
end $$;
drop trigger if exists record_card_block on public.cards;
create trigger record_card_block after insert or update on public.cards
for each row execute function public.record_card_block();
revoke all on function public.normalize_card_block(),public.record_card_block() from public,anon,authenticated;

create or replace function public.my_work(p_tab text default 'mine',p_board uuid default null,
  p_search text default '',p_timezone text default 'UTC',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare zone text; today date; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_tab is null or p_tab not in ('mine','attention') or p_page is null or p_page<1
    or length(btrim(coalesce(p_search,'')))>200 then
    raise exception 'Invalid My Work filters' using errcode='22023';
  end if;
  select name into zone from pg_timezone_names where name=p_timezone limit 1;
  today:=(now() at time zone coalesce(zone,'UTC'))::date;
  with column_status as (
    select id,name,board_id, count(*) over(partition by board_id) as n,
      row_number() over(partition by board_id order by position desc,id desc) as reverse_rank
    from public.columns
  ), candidates as (
    select c.*,jsonb_build_object('id',b.id,'name',b.name,'owner_id',b.owner_id) as board,
      jsonb_build_object('id',col.id,'name',col.name) as column,
      (select jsonb_build_object('id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,
        'email',p.email,'created_at',p.created_at,'updated_at',p.updated_at)
        from public.profiles p where p.id=c.assignee_id) as assignee,
      c.due_date is not null and (c.due_date at time zone coalesce(zone,'UTC'))::date<today as is_overdue,
      c.due_date is not null and (c.due_date at time zone coalesce(zone,'UTC'))::date=today as is_due_today
    from public.cards c join public.boards b on b.id=c.board_id
    join column_status col on col.id=c.column_id and col.board_id=c.board_id
    where lower(btrim(col.name)) not in ('done','completed') and not(col.n>=2 and col.reverse_rank=1)
      and (p_board is null or c.board_id=p_board)
      and strpos(lower(c.title),lower(btrim(coalesce(p_search,''))))>0
      and (c.assignee_id=auth.uid() or (p_tab='attention' and b.owner_id=auth.uid()))
  ), filtered as (
    select *,case when is_overdue then 'overdue' when is_due_today then 'today'
      when due_date is null then 'undated' else 'upcoming' end as "group"
    from candidates where p_tab='mine' or is_blocked or is_overdue
  ), paged as (
    select * from filtered order by due_date asc nulls last,
      case priority when 'high' then 0 when 'medium' then 1 else 2 end,id
    limit 50 offset (p_page::bigint-1)*50
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
    'counts',jsonb_build_object('overdue',(select count(*) from filtered where is_overdue),
      'dueToday',(select count(*) from filtered where is_due_today),
      'blocked',(select count(*) from filtered where is_blocked),
      'totalOpen',(select count(*) from filtered)),
    'total',(select count(*) from filtered),'page',p_page,'pageSize',50,
    'boards',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name,b.id) from public.boards b),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.my_work(text,uuid,text,text,integer) from public,anon;
grant execute on function public.my_work(text,uuid,text,text,integer) to authenticated;
create or replace function public.move_card(p_card_id uuid,p_column_id uuid,p_position integer,p_updates jsonb default '{}') returns public.cards language plpgsql security definer set search_path=public as $$
declare moved public.cards; target_count integer; requested integer;
begin
  if p_updates is null or jsonb_typeof(p_updates)<>'object' or
      p_updates-array['title','description','priority','due_date','start_date','assignee_id','recurrence_rule','cover_color','is_blocked','blocked_reason']::text[]<>'{}'::jsonb then
    raise exception 'Unsupported card update fields' using errcode='22023';
  end if;
  select * into moved from public.cards where id=p_card_id;
  if not found or not public.user_has_board_access(moved.board_id) then raise exception 'Card not found or forbidden' using errcode='42501'; end if;
  perform 1 from public.boards where id=moved.board_id for update;
  select * into moved from public.cards where id=p_card_id for update;
  if not found then raise exception 'Card no longer exists' using errcode='22023'; end if;
  if not public.user_has_board_access(moved.board_id) then raise exception 'Access revoked' using errcode='42501'; end if;
  if not exists(select 1 from public.columns where id=p_column_id and board_id=moved.board_id) or p_position is null or p_position<0 then raise exception 'Invalid destination column or position' using errcode='22023'; end if;
  with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=moved.column_id and id<>p_card_id)
  update public.cards c set position=o.n from ordered o where c.id=o.id;
  if p_column_id<>moved.column_id then
    with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=p_column_id)
    update public.cards c set position=o.n from ordered o where c.id=o.id;
  end if;
  select count(*) into target_count from public.cards where column_id=p_column_id and id<>p_card_id;
  requested:=least(p_position,target_count);
  update public.cards set position=position+1 where column_id=p_column_id and id<>p_card_id and position>=requested;
  -- Metadata shares the move transaction. Cast/constraint failures roll back every reordered row.
  update public.cards set column_id=p_column_id,position=requested,updated_at=now(),
    title=case when p_updates?'title' then p_updates->>'title' else title end,
    description=case when p_updates?'description' then p_updates->>'description' else description end,
    priority=case when p_updates?'priority' then p_updates->>'priority' else priority end,
    due_date=case when p_updates?'due_date' then (p_updates->>'due_date')::timestamptz else due_date end,
    start_date=case when p_updates?'start_date' then (p_updates->>'start_date')::timestamptz else start_date end,
    assignee_id=case when p_updates?'assignee_id' then (p_updates->>'assignee_id')::uuid else assignee_id end,
    recurrence_rule=case when p_updates?'recurrence_rule' then p_updates->>'recurrence_rule' else recurrence_rule end,
    is_blocked=case when p_updates?'is_blocked' then (p_updates->>'is_blocked')::boolean else is_blocked end,
    blocked_reason=case when p_updates?'blocked_reason' then p_updates->>'blocked_reason' else blocked_reason end,
    cover_color=case when p_updates?'cover_color' then p_updates->>'cover_color' else cover_color end
  where id=p_card_id returning * into moved;
  return moved;
end $$;
notify pgrst, 'reload schema';
commit;
