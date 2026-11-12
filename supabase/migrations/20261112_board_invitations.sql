begin;

create table if not exists account_private.board_invitations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);
alter table account_private.board_invitations enable row level security;
revoke all on account_private.board_invitations from public,anon,authenticated,service_role;
create unique index if not exists board_invitation_open on account_private.board_invitations(board_id,invitee_id)
  where status in ('pending','accepted');
create index if not exists board_invitation_board on account_private.board_invitations(board_id);
create index if not exists board_invitation_inbox on account_private.board_invitations(invitee_id) where status='pending';

create or replace function account_private.board_member_ids(p_board uuid)
returns table(user_id uuid) language sql stable set search_path=public,pg_temp as $$
  select b.owner_id from public.boards b where b.id=p_board
  union
  select tm.user_id from public.board_teams bt
    join public.team_members tm on tm.team_id=bt.team_id where bt.board_id=p_board
  union
  select i.invitee_id from account_private.board_invitations i
    where i.board_id=p_board and i.status='accepted';
$$;

-- Keep the existing public account-status wrapper used by board and card RLS.
create or replace function account_private.user_has_board_access(board_uuid uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from account_private.board_member_ids(board_uuid) m where m.user_id=auth.uid());
$$;

create or replace function public.workflow_has_access(p_board uuid,p_user uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from account_private.board_member_ids(p_board) m where m.user_id=p_user);
$$;

create or replace function public.notification_recipient_allowed(p_card_id uuid,p_board_id uuid,p_actor_id uuid,p_recipient_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.cards c where c.id=p_card_id and c.board_id=p_board_id)
    and public.workflow_has_access(p_board_id,p_actor_id)
    and public.workflow_has_access(p_board_id,p_recipient_id);
$$;

alter policy "Subtask access" on public.subtasks
  using (public.user_has_card_access(card_id))
  with check (public.user_has_card_access(card_id));

create or replace function public.board_share_context(p_board uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  can_invite boolean;
begin
  if not public.account_is_active() or not public.user_has_board_access(p_board) then
    raise exception 'Board access required' using errcode='42501';
  end if;
  select b.owner_id=auth.uid() into can_invite from public.boards b where b.id=p_board;
  return jsonb_build_object(
    'canInvite',can_invite,
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'full_name',p.full_name,'email',p.email,'avatar_url',p.avatar_url,
        'created_at',p.created_at,'updated_at',p.updated_at
      ) order by coalesce(p.full_name,p.email),p.id)
      from account_private.board_member_ids(p_board) m
      join public.profiles p on p.id=m.user_id
      join account_private.accounts a on a.id=m.user_id and a.status='active'
    ),'[]'::jsonb),
    'pendingCount',(select count(*) from account_private.board_invitations i where i.board_id=p_board and i.status='pending'),
    'pendingInvitations',case when can_invite then coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'email',u.email) order by i.created_at,i.id)
      from account_private.board_invitations i join auth.users u on u.id=i.invitee_id
      where i.board_id=p_board and i.status='pending'
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;

create or replace function public.board_invite_send(p_board uuid,p_email text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target uuid;
  invitation uuid;
begin
  -- Card writes take the same board lock through approval_00_lock and move_card.
  perform 1 from public.boards b where b.id=p_board and b.owner_id=auth.uid() for update;
  if not found or not public.account_is_active() then
    raise exception 'Only the board owner can send invitations' using errcode='42501';
  end if;
  select u.id into target from auth.users u join account_private.accounts a on a.id=u.id
    where lower(u.email)=lower(btrim(p_email)) and a.status='active'
    for share of a;
  if target is null then
    raise exception 'Enter the email of an active Helios account' using errcode='22023';
  end if;
  if public.workflow_has_access(p_board,target) then
    raise exception 'This person already has board access' using errcode='23505';
  end if;
  select i.id into invitation from account_private.board_invitations i
    where i.board_id=p_board and i.invitee_id=target and i.status='pending';
  if found then return invitation; end if;
  insert into account_private.board_invitations(board_id,invitee_id,invited_by)
    values (p_board,target,auth.uid()) returning id into invitation;
  return invitation;
end $$;

create or replace function public.board_invite_inbox()
returns table(id uuid,board_id uuid,board_name text,inviter_name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select i.id,b.id,b.name,p.full_name from account_private.board_invitations i
    join public.boards b on b.id=i.board_id
    join public.profiles p on p.id=i.invited_by
    where public.account_is_active() and i.invitee_id=auth.uid() and i.status='pending'
    order by i.created_at desc,i.id;
$$;

create or replace function public.board_invite_respond(p_invitation uuid,p_accept boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_board uuid;
  previous text;
  response text := case when p_accept then 'accepted' else 'declined' end;
begin
  if p_accept is null then
    raise exception 'Choose to accept or decline the invitation' using errcode='22023';
  end if;
  select i.board_id into target_board from account_private.board_invitations i
    where i.id=p_invitation and i.invitee_id=auth.uid();
  if not found then
    raise exception 'Board invitation unavailable' using errcode='42501';
  end if;
  perform 1 from public.boards b where b.id=target_board for update;
  perform 1 from account_private.accounts a where a.id=auth.uid() and a.status='active' for share;
  if not found then
    raise exception 'Board invitation unavailable' using errcode='42501';
  end if;
  select i.status into previous from account_private.board_invitations i where i.id=p_invitation;
  if previous=response then return target_board; end if;
  if previous is distinct from 'pending' then
    raise exception 'This board invitation is no longer pending' using errcode='PT409';
  end if;
  update account_private.board_invitations set status=response where id=p_invitation;
  return target_board;
end $$;

create or replace function public.board_invite_cancel(p_board uuid,p_invitation uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.boards b where b.id=p_board and b.owner_id=auth.uid() for update;
  if not found or not public.account_is_active() then
    raise exception 'Only the board owner can cancel invitations' using errcode='42501';
  end if;
  update account_private.board_invitations set status='cancelled'
    where id=p_invitation and board_id=p_board and status='pending';
  if not found and not exists(
    select 1 from account_private.board_invitations where id=p_invitation and board_id=p_board and status='cancelled'
  ) then
    raise exception 'This board invitation is no longer pending' using errcode='PT409';
  end if;
end $$;

create or replace function account_private.guard_board_assignment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  offboarding_transfer boolean := false;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op='UPDATE' then
    if new.assignee_id is not distinct from old.assignee_id and new.board_id=old.board_id then return new; end if;
    -- The existing privileged deletion worker must transfer work owned by the departing account.
    offboarding_transfer := auth.uid() is null and exists(
      select 1 from account_private.accounts a where a.id=old.assignee_id and a.status='deleting'
    );
  end if;
  if not offboarding_transfer and exists(
    select 1 from account_private.board_invitations i where i.board_id=new.board_id and i.status='pending'
  ) then
    raise exception 'Wait for pending board invitations to be resolved before assigning tasks' using errcode='PT409';
  end if;
  if not public.workflow_has_access(new.board_id,new.assignee_id) then
    raise exception 'Choose a board member. Invite this person to the board first.' using errcode='PT409';
  end if;
  return new;
end $$;
drop trigger if exists board_assignment_guard on public.cards;
create trigger board_assignment_guard before insert or update of assignee_id,board_id on public.cards
  for each row execute function account_private.guard_board_assignment();

create or replace function account_private.cancel_inactive_board_invitations()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update account_private.board_invitations set status='cancelled'
    where invitee_id=new.id and status='pending';
  return new;
end $$;
drop trigger if exists cancel_inactive_board_invitations on account_private.accounts;
create trigger cancel_inactive_board_invitations after update of status on account_private.accounts
  for each row when (old.status is distinct from new.status and new.status<>'active')
  execute function account_private.cancel_inactive_board_invitations();

revoke all on function account_private.board_member_ids(uuid),account_private.guard_board_assignment(),
  account_private.cancel_inactive_board_invitations()
  from public,anon,authenticated,service_role;
revoke all on function public.board_share_context(uuid),public.board_invite_send(uuid,text),
  public.board_invite_inbox(),public.board_invite_respond(uuid,boolean),public.board_invite_cancel(uuid,uuid) from public,anon;
grant execute on function public.board_share_context(uuid),public.board_invite_send(uuid,text),
  public.board_invite_inbox(),public.board_invite_respond(uuid,boolean),public.board_invite_cancel(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
