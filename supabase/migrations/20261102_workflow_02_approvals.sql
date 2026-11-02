-- Approval state is writable only through locked, authenticated transitions.
begin;
create table if not exists public.card_approval_settings (
 card_id uuid primary key references public.cards(id) on delete cascade,
 required boolean not null default false,
 reviewer_id uuid references public.profiles(id) on delete set null,
 revision bigint not null default 1 check(revision>0),
 approved_revision bigint,
 completed_checkpoint boolean not null default false
);
create table if not exists public.approval_requests (
 id uuid primary key default gen_random_uuid(),
 card_id uuid not null references public.cards(id) on delete cascade,
 revision bigint not null,
 requester_id uuid references public.profiles(id) on delete set null,
 reviewer_id uuid references public.profiles(id) on delete set null,
 review_due_date date not null,
 review_timezone text not null,
 status text not null check(status in ('pending','approved','changes_requested','withdrawn','superseded')),
 decision_note text check(length(decision_note)<=2000),
 requested_at timestamptz not null default now(), decided_at timestamptz
);
create unique index if not exists approval_one_pending on public.approval_requests(card_id) where status='pending';
create index if not exists approval_reviewer_pending on public.approval_requests(reviewer_id,card_id) where status='pending';
create index if not exists approval_card_revision on public.approval_requests(card_id,revision,requested_at desc,id desc);
create table if not exists public.approval_history (
 id uuid primary key default gen_random_uuid(),
 card_id uuid not null references public.cards(id) on delete cascade,
 request_id uuid references public.approval_requests(id) on delete set null,
 revision bigint not null,
 actor_id uuid references public.profiles(id) on delete set null,
 actor_name text,
 action text not null, note text check(length(note)<=2000),
 created_at timestamptz not null default now()
);
create table if not exists public.approval_operations (
 id uuid primary key, card_id uuid not null references public.cards(id) on delete cascade,
 actor_id uuid not null, action text not null, payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.card_approval_settings enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_history enable row level security;
alter table public.approval_operations enable row level security;
revoke all on public.card_approval_settings,public.approval_requests,public.approval_history,public.approval_operations from public,anon,authenticated;
grant select on public.card_approval_settings,public.approval_requests,public.approval_history to authenticated;
grant all on public.card_approval_settings,public.approval_requests,public.approval_history,public.approval_operations to service_role;
drop policy if exists approval_settings_read on public.card_approval_settings;
create policy approval_settings_read on public.card_approval_settings for select to authenticated using(public.user_has_card_access(card_id));
drop policy if exists approval_requests_read on public.approval_requests;
create policy approval_requests_read on public.approval_requests for select to authenticated using(public.user_has_card_access(card_id));
drop policy if exists approval_history_read on public.approval_history;
create policy approval_history_read on public.approval_history for select to authenticated using(public.user_has_card_access(card_id));

create or replace function public.approval_column_complete(p_column uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select lower(btrim(c.name)) in ('done','completed') or
  ((select count(*) from columns x where x.board_id=c.board_id)>=2 and
    c.id=(select x.id from columns x where x.board_id=c.board_id order by x.position desc,x.id desc limit 1))
 from columns c where c.id=p_column),false)
$$;

-- Direct table writes also take board locks before PostgreSQL locks target rows.
-- A statement trigger cannot see its target row set: serialize the caller's accessible
-- boards in UUID order. RPC paths take the same locks, without trusting client flags.
create or replace function public.approval_lock_boards() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform b.id from boards b where auth.uid() is null or workflow_has_access(b.id,auth.uid()) order by b.id for update;
 return null;
end $$;

create or replace function public.approval_invalidate(p_card uuid,p_note text,p_reopening boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare s card_approval_settings; c cards; r approval_requests;
begin
 select * into c from cards where id=p_card for update;
 if not found then return; end if;
 if auth.uid() is not null and not workflow_has_access(c.board_id,auth.uid()) then
  raise exception 'Board access revoked' using errcode='42501'; end if;
 select * into s from card_approval_settings where card_id=p_card for update;
 if not found then return; end if;
 if s.required and approval_column_complete(c.column_id) and not p_reopening then
  raise exception 'Reopen this task before changing reviewed content' using errcode='23514'; end if;
 select * into r from approval_requests where card_id=p_card and revision=s.revision and status in ('pending','approved') order by requested_at desc,id desc limit 1 for update;
 update card_approval_settings set revision=revision+1,approved_revision=null where card_id=p_card;
 if r.id is not null then
  update approval_requests set status='superseded',decided_at=now() where id=r.id;
  insert into approval_history(card_id,request_id,revision,actor_id,actor_name,action,note)
   values(p_card,r.id,s.revision,auth.uid(),(select full_name from profiles where id=auth.uid()),'invalidated',p_note);
  perform workflow_emit('approval:invalidated:'||r.id||':'||(s.revision+1),'review_invalidated',p_card,auth.uid(),array[r.requester_id,r.reviewer_id],
   'Review invalidated: '||c.title,p_note,jsonb_build_object('request_id',r.id,'revision',s.revision));
 end if;
end $$;

create or replace function public.approval_guard_card() returns trigger
language plpgsql security definer set search_path=public as $$
declare s card_approval_settings; source cards; material boolean;
begin
 if auth.uid() is not null and not workflow_has_access(new.board_id,auth.uid()) then
  raise exception 'Board access revoked' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.recurrence_parent_id is not null then
   select * into source from cards where id=new.recurrence_parent_id;
   if source.id is null or source.board_id<>new.board_id or (auth.uid() is not null and not workflow_has_access(source.board_id,auth.uid())) then
    raise exception 'Invalid recurrence source' using errcode='42501'; end if;
   new.is_blocked:=false; new.blocked_reason:=null;
   if exists(select 1 from card_approval_settings where card_id=source.id and required) and approval_column_complete(new.column_id) then
    raise exception 'Recurring approval task must start in an open column' using errcode='23514'; end if;
  end if;
  return new;
 end if;
 if new.board_id<>old.board_id then raise exception 'Moving tasks between boards is unsupported' using errcode='22023'; end if;
 select * into s from card_approval_settings where card_id=old.id for update;
 if s.card_id is null then return new; end if;
 material:=new.title is distinct from old.title or new.description is distinct from old.description or new.assignee_id is distinct from old.assignee_id;
 if s.required and material and approval_column_complete(old.column_id) then
  raise exception 'Reopen this task before changing reviewed content' using errcode='23514'; end if;
 if material or (s.required and approval_column_complete(old.column_id) and not approval_column_complete(new.column_id)) then
  perform approval_invalidate(old.id,case when material then 'Task content changed' else 'Task reopened' end,not material);
  select * into s from card_approval_settings where card_id=old.id;
 end if;
 if s.required and approval_column_complete(new.column_id) and s.approved_revision is distinct from s.revision then
  raise exception 'Approval required before completing this task' using errcode='23514'; end if;
 update card_approval_settings set completed_checkpoint=approval_column_complete(new.column_id) where card_id=old.id;
 return new;
end $$;

create or replace function public.approval_copy_recurrence() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.recurrence_parent_id is not null then
  insert into card_approval_settings(card_id,required,reviewer_id)
   select new.id,s.required,s.reviewer_id from card_approval_settings s join cards c on c.id=s.card_id
   where s.card_id=new.recurrence_parent_id and c.board_id=new.board_id;
 end if;
 return new;
end $$;

create or replace function public.approval_guard_related() returns trigger
language plpgsql security definer set search_path=public as $$
declare target uuid; old_target uuid;
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 if tg_op<>'INSERT' then old_target:=old.card_id; end if;
 if tg_op<>'DELETE' then target:=new.card_id; end if;
 if old_target is not null then perform approval_invalidate(old_target,'Reviewed task content changed'); end if;
 if target is not null and target is distinct from old_target then perform approval_invalidate(target,'Reviewed task content changed'); end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create or replace function public.approval_guard_definition() returns trigger
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if tg_op='UPDATE' and new.name is not distinct from old.name and new.field_type is not distinct from old.field_type and new.options is not distinct from old.options and new.board_id=old.board_id then return new; end if;
 for target in select distinct card_id from custom_field_values where field_id=old.id order by card_id loop
  perform approval_invalidate(target,'Referenced custom field definition changed');
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.approval_guard_columns() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from card_approval_settings s join cards c on c.id=s.card_id
   where s.required and s.completed_checkpoint is distinct from approval_column_complete(c.column_id)) then
  raise exception 'Column change would implicitly complete or reopen approval tasks; handle affected tasks explicitly first' using errcode='23514';
 end if;
 return null;
end $$;
create or replace function public.approval_guard_column_row() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.board_id<>old.board_id then raise exception 'Moving columns between boards is unsupported' using errcode='22023'; end if;
 if auth.uid() is not null and not workflow_has_access(case when tg_op='DELETE' then old.board_id else new.board_id end,auth.uid()) then
  raise exception 'Board access revoked' using errcode='42501'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists approval_00_lock on cards;
create trigger approval_00_lock before insert or update or delete on cards for each statement execute function approval_lock_boards();
drop trigger if exists approval_guard on cards;
create trigger approval_guard before insert or update on cards for each row execute function approval_guard_card();
drop trigger if exists approval_copy on cards;
create trigger approval_copy after insert on cards for each row execute function approval_copy_recurrence();
drop trigger if exists approval_00_lock on columns;
create trigger approval_00_lock before insert or update or delete on columns for each statement execute function approval_lock_boards();
drop trigger if exists approval_column_access on columns;
create trigger approval_column_access before insert or update or delete on columns for each row execute function approval_guard_column_row();
drop trigger if exists approval_column_shape on columns;
create trigger approval_column_shape after insert or update or delete on columns for each statement execute function approval_guard_columns();
drop trigger if exists approval_00_lock on subtasks;
create trigger approval_00_lock before insert or update or delete on subtasks for each statement execute function approval_lock_boards();
drop trigger if exists approval_related on subtasks;
create trigger approval_related before insert or update or delete on subtasks for each row execute function approval_guard_related();
drop trigger if exists approval_00_lock on attachments;
create trigger approval_00_lock before insert or update or delete on attachments for each statement execute function approval_lock_boards();
drop trigger if exists approval_related on attachments;
create trigger approval_related before insert or update or delete on attachments for each row execute function approval_guard_related();
drop trigger if exists approval_00_lock on custom_field_values;
create trigger approval_00_lock before insert or update or delete on custom_field_values for each statement execute function approval_lock_boards();
drop trigger if exists approval_related on custom_field_values;
create trigger approval_related after insert or update or delete on custom_field_values for each row execute function approval_guard_related();
drop trigger if exists approval_00_lock on custom_field_definitions;
create trigger approval_00_lock before insert or update or delete on custom_field_definitions for each statement execute function approval_lock_boards();
drop trigger if exists approval_definition on custom_field_definitions;
create trigger approval_definition before update or delete on custom_field_definitions for each row execute function approval_guard_definition();

-- Storage removes bytes before the attachment metadata endpoint runs. Guard the
-- referenced object too, so a completed task's evidence cannot disappear first.
create or replace function public.approval_guard_attachment_object() returns trigger
language plpgsql security definer set search_path=public as $$
declare target uuid; old_path text; new_path text;
begin
 if tg_op<>'INSERT' and old.bucket_id='attachments' then old_path:=old.name; end if;
 if tg_op<>'DELETE' and new.bucket_id='attachments' then new_path:=new.name; end if;
 if old_path is null and new_path is null then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='UPDATE' and to_jsonb(old)=to_jsonb(new) then return new; end if;
 for target in select distinct a.card_id from attachments a where a.storage_path in (old_path,new_path) order by a.card_id loop
  perform approval_invalidate(target,'Reviewed attachment file changed');
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists approval_00_lock on storage.objects;
create trigger approval_00_lock before insert or update or delete on storage.objects for each statement execute function public.approval_lock_boards();
drop trigger if exists approval_attachment_object on storage.objects;
create trigger approval_attachment_object before insert or update or delete on storage.objects for each row execute function public.approval_guard_attachment_object();
revoke all on function public.approval_guard_attachment_object() from public,anon,authenticated;

create or replace function public.get_card_approval(p_card_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c cards; s card_approval_settings; r approval_requests; owner uuid; zone text; review_status text; eligible boolean;
begin
 select * into c from cards where id=p_card_id;
 if c.id is null or auth.uid() is null or not workflow_has_access(c.board_id,auth.uid()) then raise exception 'Card access forbidden' using errcode='42501'; end if;
 select owner_id into owner from boards where id=c.board_id;
 select * into s from card_approval_settings where card_id=c.id;
 select * into r from approval_requests where card_id=c.id and revision=coalesce(s.revision,1) order by requested_at desc,id desc limit 1;
 select timezone into zone from board_workflow_settings where board_id=c.board_id;
 review_status:=case when s.approved_revision=s.revision then 'approved' when r.status in ('pending','changes_requested') then r.status else 'not_requested' end;
 eligible:=s.reviewer_id is not null and s.reviewer_id<>auth.uid() and s.reviewer_id is distinct from c.assignee_id and workflow_has_access(c.board_id,s.reviewer_id);
 return jsonb_build_object('required',coalesce(s.required,false),'reviewer_id',s.reviewer_id,'revision',coalesce(s.revision,1),'status',review_status,
  'can_configure',auth.uid()=owner,'can_request',coalesce(s.required,false) and auth.uid() in (owner,c.assignee_id) and review_status not in ('pending','approved') and eligible and not approval_column_complete(c.column_id),
  'can_withdraw',review_status='pending' and auth.uid() in (owner,c.assignee_id),
  'can_decide',review_status='pending' and r.reviewer_id=auth.uid() and r.reviewer_id=s.reviewer_id and r.reviewer_id is distinct from c.assignee_id and r.reviewer_id is distinct from r.requester_id,
  'current_request',case when r.id is not null then to_jsonb(r)||jsonb_build_object('requester_name',(select full_name from profiles where id=r.requester_id),'reviewer_name',(select full_name from profiles where id=r.reviewer_id)) else null end,
  'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'note',h.note,'created_at',h.created_at,'actor_name',h.actor_name) order by h.created_at,h.id) from approval_history h where h.card_id=c.id),'[]'::jsonb),
  'eligible_reviewers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url) order by p.full_name,p.id) from profiles p where p.id is distinct from c.assignee_id and workflow_has_access(c.board_id,p.id)),'[]'::jsonb),
  'timezone',coalesce(zone,'UTC'),'current_user_id',auth.uid());
end $$;

create or replace function public.transition_card_approval(p_card_id uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c cards; s card_approval_settings; r approval_requests; op approval_operations; owner uuid; operation uuid; expected bigint;
 reviewer uuid; needed boolean; note text; deadline date; zone text; action_name text; recipients uuid[];
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_action not in ('configure','request','approve','request_changes','withdraw') then raise exception 'Invalid approval action' using errcode='22023'; end if;
 operation:=(p_payload->>'operationId')::uuid; expected:=(p_payload->>'expectedRevision')::bigint;
 if operation is null or expected is null or expected<1 then raise exception 'Operation ID and revision required' using errcode='22023'; end if;
 note:=nullif(btrim(coalesce(p_payload->>'note',p_payload->>'reason')),'');
 if length(note)>2000 then raise exception 'Notes must be at most 2000 characters' using errcode='22023'; end if;
 select * into c from cards where id=p_card_id;
 if c.id is null then raise exception 'Card access forbidden' using errcode='42501'; end if;
 perform 1 from boards where id=c.board_id for update;
 select * into c from cards where id=p_card_id for update;
 if c.id is null or not workflow_has_access(c.board_id,auth.uid()) then raise exception 'Card access forbidden' using errcode='42501'; end if;
 select owner_id into owner from boards where id=c.board_id;
 select * into op from approval_operations where id=operation;
 if op.id is not null then
  if op.card_id<>p_card_id or op.actor_id<>auth.uid() or op.action<>p_action or op.payload<>p_payload then raise exception 'Operation ID conflict' using errcode='40001'; end if;
  return get_card_approval(p_card_id);
 end if;
 select * into s from card_approval_settings where card_id=p_card_id for update;
 if expected<>coalesce(s.revision,1) then raise exception 'Task revision changed; refresh before retrying' using errcode='40001'; end if;
 if p_action='configure' then
  if owner<>auth.uid() then raise exception 'Only the board owner can configure approval' using errcode='42501'; end if;
  if not(p_payload?'required') or jsonb_typeof(p_payload->'required')<>'boolean' then raise exception 'Required must be boolean' using errcode='22023'; end if;
  needed:=(p_payload->>'required')::boolean; reviewer:=(p_payload->>'reviewerId')::uuid;
  if needed and (reviewer is null or reviewer is not distinct from c.assignee_id or not workflow_has_access(c.board_id,reviewer)) then raise exception 'Choose an eligible reviewer with current board access' using errcode='22023'; end if;
  if coalesce(s.required,false) and not needed and note is null then raise exception 'Disabling approval requires a reason' using errcode='22023'; end if;
  if needed and approval_column_complete(c.column_id) and (not coalesce(s.required,false) or reviewer is distinct from s.reviewer_id) then raise exception 'Reopen this task before changing approval configuration' using errcode='23514'; end if;
  if s.card_id is not null and (needed is distinct from s.required or reviewer is distinct from s.reviewer_id) then
   -- Configuration is an explicit owner action, including on completed work.
   select * into r from approval_requests where card_id=p_card_id and revision=s.revision and status in ('pending','approved') order by requested_at desc,id desc limit 1 for update;
   update approval_requests set status='superseded',decided_at=now() where card_id=p_card_id and revision=s.revision and status in ('pending','approved');
   if r.id is not null then perform workflow_emit('approval:configure:'||operation,'review_invalidated',c.id,auth.uid(),array[r.requester_id,r.reviewer_id], 'Review configuration changed: '||c.title,note,jsonb_build_object('request_id',r.id,'revision',s.revision)); end if;
   update card_approval_settings set required=needed,reviewer_id=reviewer,revision=revision+1,approved_revision=null where card_id=c.id;
  elsif s.card_id is null then
   insert into card_approval_settings(card_id,required,reviewer_id,completed_checkpoint) values(c.id,needed,reviewer,approval_column_complete(c.column_id));
  end if;
  action_name:='configured';
 else
  if not coalesce(s.required,false) then raise exception 'Approval is not required for this task' using errcode='22023'; end if;
  if p_action='request' then
   if auth.uid() is distinct from owner and auth.uid() is distinct from c.assignee_id then raise exception 'Only assignee or owner can request review' using errcode='42501'; end if;
   if approval_column_complete(c.column_id) then raise exception 'Reopen this task before requesting review' using errcode='23514'; end if;
   if s.reviewer_id is null or s.reviewer_id=auth.uid() or s.reviewer_id is not distinct from c.assignee_id or not workflow_has_access(c.board_id,s.reviewer_id) then raise exception 'Choose an eligible reviewer with current board access' using errcode='22023'; end if;
   if exists(select 1 from approval_requests where card_id=c.id and revision=s.revision and status in ('pending','approved')) then raise exception 'Review already requested or approved' using errcode='40001'; end if;
   select timezone into zone from board_workflow_settings where board_id=c.board_id;
   zone:=coalesce(zone,'UTC'); deadline:=(p_payload->>'reviewDueDate')::date;
   if deadline is null then raise exception 'Review deadline is required' using errcode='22023'; end if;
   if deadline<(now() at time zone zone)::date then raise exception 'Review deadline cannot be in the past' using errcode='22023'; end if;
   insert into approval_requests(card_id,revision,requester_id,reviewer_id,review_due_date,review_timezone,status)
    values(c.id,s.revision,auth.uid(),s.reviewer_id,deadline,zone,'pending') returning * into r;
   action_name:='requested'; recipients:=array[r.reviewer_id];
  else
   select * into r from approval_requests where id=(p_payload->>'requestId')::uuid and card_id=c.id for update;
   if r.id is null or r.revision<>s.revision or r.status<>'pending' then raise exception 'Review request is stale or already decided' using errcode='40001'; end if;
   if p_action='withdraw' then
    if auth.uid() is distinct from owner and auth.uid() is distinct from c.assignee_id then raise exception 'Only assignee or owner can withdraw review' using errcode='42501'; end if;
    action_name:='withdrawn'; recipients:=array[r.reviewer_id];
   else
    if auth.uid() is distinct from r.reviewer_id or r.reviewer_id is distinct from s.reviewer_id or r.reviewer_id is not distinct from r.requester_id or r.reviewer_id is not distinct from c.assignee_id or not workflow_has_access(c.board_id,r.reviewer_id) then raise exception 'Only the current eligible reviewer can decide' using errcode='42501'; end if;
    if p_action='request_changes' and note is null then raise exception 'Request changes requires a reason' using errcode='22023'; end if;
    action_name:=case when p_action='approve' then 'approved' else 'changes_requested' end;
    recipients:=array[r.requester_id,c.assignee_id];
   end if;
   update approval_requests set status=action_name,decision_note=note,decided_at=now() where id=r.id;
   if p_action='approve' then update card_approval_settings set approved_revision=revision where card_id=c.id; end if;
  end if;
  perform workflow_emit('approval:'||operation,'review_'||action_name,c.id,auth.uid(),recipients,
   'Review '||replace(action_name,'_',' ')||': '||c.title,note,jsonb_build_object('request_id',r.id,'revision',s.revision));
 end if;
 insert into approval_history(card_id,request_id,revision,actor_id,actor_name,action,note)
  values(c.id,r.id,(select revision from card_approval_settings where card_id=c.id),auth.uid(),(select full_name from profiles where id=auth.uid()),action_name,note);
 insert into approval_operations(id,card_id,actor_id,action,payload) values(operation,c.id,auth.uid(),p_action,p_payload);
 return get_card_approval(c.id);
end $$;

create or replace function public.update_board_columns(p_board_id uuid,p_columns jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from boards where id=p_board_id for update;
 if auth.uid() is null or not workflow_has_access(p_board_id,auth.uid()) then raise exception 'Board access forbidden' using errcode='42501'; end if;
 if p_columns is null or jsonb_typeof(p_columns)<>'array' or jsonb_array_length(p_columns)=0 then raise exception 'Columns are required' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_columns) v where jsonb_typeof(v)<>'object' or not(v?'id') or v-array['id','name','position','color']<>'{}'::jsonb
  or (v?'name' and (jsonb_typeof(v->'name')<>'string' or length(v->>'name') not between 1 and 50))
  or (v?'position' and ((v->>'position')::integer<0 or jsonb_typeof(v->'position')<>'number'))
  or not exists(select 1 from columns c where c.id=(v->>'id')::uuid and c.board_id=p_board_id))
  or (select count(*)<>count(distinct v->>'id') from jsonb_array_elements(p_columns) v) then raise exception 'Invalid columns' using errcode='22023'; end if;
 update columns c set name=case when v?'name' then v->>'name' else c.name end,
  position=case when v?'position' then (v->>'position')::integer else c.position end,
  color=case when v?'color' then v->>'color' else c.color end
 from jsonb_array_elements(p_columns) v where c.id=(v->>'id')::uuid and c.board_id=p_board_id;
 return true;
end $$;

create or replace function public.create_board_column(p_board_id uuid,p_name text,p_color text default null) returns public.columns
language plpgsql security definer set search_path=public as $$
declare result public.columns;
begin
 perform 1 from boards where id=p_board_id for update;
 if auth.uid() is null or not workflow_has_access(p_board_id,auth.uid()) then raise exception 'Board access forbidden' using errcode='42501'; end if;
 if p_name is null or length(p_name) not between 1 and 50 then raise exception 'Column name is required' using errcode='22023'; end if;
 insert into columns(board_id,name,position,color) values(p_board_id,p_name,coalesce((select max(position)+1 from columns where board_id=p_board_id),0),p_color) returning * into result;
 return result;
end $$;

create or replace function public.delete_board_column(p_board_id uuid,p_column_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare destination uuid; destination_count integer;
begin
 perform 1 from public.boards where id=p_board_id for update;
 if auth.uid() is null or not workflow_has_access(p_board_id,auth.uid()) then raise exception 'Board access forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.columns where id=p_column_id and board_id=p_board_id) then raise exception 'Column not found' using errcode='22023'; end if;
 select id into destination from public.columns where board_id=p_board_id and id<>p_column_id order by position,id limit 1;
 if destination is null then raise exception 'Cannot delete the last column' using errcode='22023'; end if;
 if exists(select 1 from cards c join card_approval_settings s on s.card_id=c.id where c.column_id=p_column_id and s.required and s.completed_checkpoint is distinct from approval_column_complete(destination)) then
  raise exception 'Column deletion would implicitly complete or reopen approval tasks; handle affected tasks explicitly first' using errcode='23514'; end if;
 with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=destination)
 update public.cards c set position=o.n from ordered o where c.id=o.id;
 select count(*) into destination_count from public.cards where column_id=destination;
 with ordered as (select id,(row_number() over(order by position,id)-1)::integer as n from public.cards where column_id=p_column_id)
 update public.cards c set column_id=destination,position=destination_count+o.n from ordered o where c.id=o.id;
 delete from public.columns where id=p_column_id and board_id=p_board_id;
 return true;
end $$;

-- Restrict every privileged helper; only the two UI RPCs and atomic column RPC are public API.
revoke all on function public.approval_column_complete(uuid),public.approval_lock_boards(),public.approval_invalidate(uuid,text,boolean),public.approval_guard_card(),public.approval_copy_recurrence(),public.approval_guard_related(),public.approval_guard_definition(),public.approval_guard_columns(),public.approval_guard_column_row(),public.get_card_approval(uuid),public.transition_card_approval(uuid,text,jsonb),public.update_board_columns(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_card_approval(uuid),public.transition_card_approval(uuid,text,jsonb),public.update_board_columns(uuid,jsonb) to authenticated;
revoke all on function public.create_board_column(uuid,text,text) from public,anon;
grant execute on function public.create_board_column(uuid,text,text) to authenticated;

create or replace function public.my_work(p_tab text default 'mine',p_board uuid default null,
 p_search text default '',p_timezone text default 'UTC',p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare zone text; today date; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_tab is null or p_tab not in ('mine','attention') or p_page is null or p_page<1 or length(btrim(coalesce(p_search,'')))>200 then
  raise exception 'Invalid My Work filters' using errcode='22023'; end if;
 select name into zone from pg_timezone_names where name=p_timezone limit 1;
 today:=(now() at time zone coalesce(zone,'UTC'))::date;
 with column_status as (
  select id,name,board_id,count(*) over(partition by board_id) as n,
   row_number() over(partition by board_id order by position desc,id desc) as reverse_rank from public.columns
 ), candidates as (
  select c.*,jsonb_build_object('id',b.id,'name',b.name,'owner_id',b.owner_id) as board,
   jsonb_build_object('id',col.id,'name',col.name) as column,
   (select jsonb_build_object('id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,'email',p.email,'created_at',p.created_at,'updated_at',p.updated_at) from public.profiles p where p.id=c.assignee_id) as assignee,
   c.due_date is not null and (c.due_date at time zone coalesce(zone,'UTC'))::date<today as is_overdue,
   c.due_date is not null and (c.due_date at time zone coalesce(zone,'UTC'))::date=today as is_due_today,
   case when s.approved_revision=s.revision then 'approved' when r.status in ('pending','changes_requested') then r.status else 'not_requested' end as approval_status,
   coalesce(s.required and r.status='pending' and r.reviewer_id=auth.uid() and r.reviewer_id=s.reviewer_id
    and r.reviewer_id is distinct from r.requester_id and r.reviewer_id is distinct from c.assignee_id,false) as pending_my_review
  from public.cards c join public.boards b on b.id=c.board_id
  join column_status col on col.id=c.column_id and col.board_id=c.board_id
  left join public.card_approval_settings s on s.card_id=c.id
  left join lateral (select a.* from public.approval_requests a where a.card_id=c.id and a.revision=s.revision order by a.requested_at desc,a.id desc limit 1) r on true
  where lower(btrim(col.name)) not in ('done','completed') and not(col.n>=2 and col.reverse_rank=1)
   and (p_board is null or c.board_id=p_board) and strpos(lower(c.title),lower(btrim(coalesce(p_search,''))))>0
   and (c.assignee_id=auth.uid() or (p_tab='attention' and (b.owner_id=auth.uid() or
    (s.required and r.status='pending' and r.reviewer_id=auth.uid() and r.reviewer_id=s.reviewer_id and r.reviewer_id is distinct from r.requester_id and r.reviewer_id is distinct from c.assignee_id))))
 ), filtered as (
  select *,case when is_overdue then 'overdue' when is_due_today then 'today' when due_date is null then 'undated' else 'upcoming' end as "group"
  from candidates where p_tab='mine' or is_blocked or is_overdue or pending_my_review
 ), paged as (
  select * from filtered order by due_date asc nulls last,case priority when 'high' then 0 when 'medium' then 1 else 2 end,id limit 50 offset (p_page::bigint-1)*50
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
  'counts',jsonb_build_object('overdue',(select count(*) from filtered where is_overdue),'dueToday',(select count(*) from filtered where is_due_today),
   'blocked',(select count(*) from filtered where is_blocked),'pendingMyReview',(select count(*) from filtered where pending_my_review),'totalOpen',(select count(*) from filtered)),
  'total',(select count(*) from filtered),'page',p_page,'pageSize',50,
  'boards',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name,b.id) from public.boards b),'[]'::jsonb)) into result;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
