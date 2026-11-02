begin;
alter table public.workflow_deliveries add column if not exists started_lease_token uuid;
create table if not exists public.workflow_maintenance_gate(singleton boolean primary key default true check(singleton),not_before timestamptz not null default '-infinity');
insert into public.workflow_maintenance_gate(singleton) values(true) on conflict do nothing;
alter table public.workflow_maintenance_gate enable row level security;
revoke all on public.workflow_maintenance_gate from public,anon,authenticated;
grant all on public.workflow_maintenance_gate to service_role;
create or replace function public.workflow_begin_maintenance() returns boolean language plpgsql security definer set search_path=public as $$
begin
 update workflow_maintenance_gate set not_before=now()+interval '60 seconds' where singleton and not_before<=now();
 return found;
end $$;
create or replace function public.workflow_card_open(p_card uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from cards c join columns col on col.id=c.column_id where c.id=p_card
 and lower(trim(col.name)) not in ('done','completed')
 and not ((select count(*) from columns where board_id=c.board_id)>=2 and col.id=(select id from columns where board_id=c.board_id order by position desc,id desc limit 1)));
$$;
create or replace function public.workflow_notification_current(p_notification uuid) returns boolean language plpgsql stable security definer set search_path=public as $$
declare n notifications; c cards; ok boolean; zone text; deadline date; local_today date;
begin
 select * into n from notifications where id=p_notification;
 select * into c from cards where id=n.card_id;
 if c.id is null or not workflow_has_access(c.board_id,n.recipient_id) then return false; end if;
 if n.type='assignment' then return c.assignee_id=n.recipient_id and n.metadata->>'assignment_version'=c.notification_assignment_version::text; end if;
 if n.type in ('due_today','overdue','escalation') then
  if not coalesce((select scheduling_enabled from board_workflow_settings where board_id=c.board_id),false) or not workflow_card_open(c.id) then return false; end if;
  if n.metadata ? 'due_version' and (n.metadata->>'due_version')::bigint<>c.notification_due_version then return false; end if;
  if n.metadata ? 'request_id' then
   select r.review_due_date,r.review_timezone into deadline,zone from approval_requests r where r.id=(n.metadata->>'request_id')::uuid and r.card_id=c.id;
  else
   select timezone into zone from board_workflow_settings where board_id=c.board_id;
   deadline:=(c.due_date at time zone zone)::date;
  end if;
  if deadline is null or zone is null then return false; end if;
  local_today:=(now() at time zone zone)::date;
  if (n.type='due_today' and local_today<>deadline) or (n.type='overdue' and local_today<=deadline) or (n.type='escalation' and local_today<deadline+2) then return false; end if;
 end if;
 if n.metadata ? 'request_id' and (n.type='review_requested' or n.type in ('due_today','overdue','escalation')) then
  execute 'select exists(select 1 from public.approval_requests r join public.card_approval_settings s on s.card_id=r.card_id where r.id=$1 and r.status=''pending'' and r.revision=s.revision and r.reviewer_id=$2)' into ok using (n.metadata->>'request_id')::uuid,case when n.type='escalation' then (n.metadata->>'reviewer_id')::uuid else n.recipient_id end;
  if not ok then return false; end if;
 end if;
 if n.metadata ? 'request_id' and n.type in ('review_approved','review_changes_requested','review_withdrawn') then
  execute 'select exists(select 1 from approval_requests r join card_approval_settings s on s.card_id=r.card_id where r.id=$1 and r.revision=s.revision and r.status=$2 and not exists(select 1 from approval_requests newer where newer.card_id=r.card_id and (newer.requested_at,newer.id)>(r.requested_at,r.id)))' into ok using (n.metadata->>'request_id')::uuid,replace(n.type,'review_','');
  if not ok then return false; end if;
 end if;
 return true;
end $$;
create or replace function public.workflow_generate() returns void language plpgsql security definer set search_path=public as $$
declare target_board record; c cards; r record; phase text; local_today date; deadline date; recipients uuid[];
begin
 if not (select producers_enabled from workflow_runtime where singleton) then return; end if;
 if not pg_try_advisory_xact_lock(20261102,3) then return; end if;
 -- All source mutations take the board lock first. Re-read settings and source state
 -- after that lock, then lock cards/requests in UUID order before emitting.
 for target_board in select b.id from boards b join board_workflow_settings s on s.board_id=b.id where s.scheduling_enabled order by b.id loop
  perform 1 from boards where id=target_board.id for update;
  select b.id,b.owner_id,s.timezone,s.scheduling_enabled into target_board from boards b join board_workflow_settings s on s.board_id=b.id where b.id=target_board.id;
  if not target_board.scheduling_enabled then continue; end if;
  for c in select * from cards where board_id=target_board.id order by id for update loop
   if not workflow_card_open(c.id) then continue; end if;
   if c.due_date is not null then
    local_today:=(now() at time zone target_board.timezone)::date;
    deadline:=(c.due_date at time zone target_board.timezone)::date;
    for phase in select v from (values('due_today'),('overdue'),('escalation')) phases(v) where (v='due_today' and local_today=deadline) or (v='overdue' and local_today>=deadline+1) or (v='escalation' and local_today>=deadline+2) loop
     recipients:=case when phase='escalation' then array[target_board.owner_id] else array[c.assignee_id] end;
     perform workflow_emit('due:'||c.id||':'||c.notification_due_version||':'||phase,phase,c.id,null,recipients,c.title||case phase when 'due_today' then ' is due today' when 'overdue' then ' is overdue' else ' needs attention' end,null,jsonb_build_object('due_version',c.notification_due_version));
    end loop;
   end if;
   for r in select a.* from approval_requests a join card_approval_settings s on s.card_id=a.card_id where a.card_id=c.id and a.status='pending' and a.revision=s.revision order by a.id for update of a loop
    local_today:=(now() at time zone r.review_timezone)::date; deadline:=r.review_due_date;
    for phase in select v from (values('due_today'),('overdue'),('escalation')) phases(v) where (v='due_today' and local_today=deadline) or (v='overdue' and local_today>=deadline+1) or (v='escalation' and local_today>=deadline+2) loop
     recipients:=case when phase='escalation' then array[target_board.owner_id] else array[r.reviewer_id] end;
     perform workflow_emit('review-due:'||r.id||':'||phase,phase,c.id,null,recipients,'Review '||replace(phase,'_',' '),null,jsonb_build_object('request_id',r.id,'reviewer_id',r.reviewer_id,'revision',r.revision));
    end loop;
   end loop;
  end loop;
 end loop;
end $$;
create or replace function public.workflow_claim_deliveries(p_email_enabled boolean,p_from text,p_app_url text) returns jsonb language plpgsql security definer set search_path=public as $$
declare d workflow_deliveries; n notifications; p profiles; result jsonb:='[]'; token uuid;
begin
 -- Expired leases may have been accepted remotely. Preserve payload/key and never blindly resend past 24h.
 update workflow_deliveries set status='needs_review',lease_token=null,lease_until=null,last_error='Ambiguous delivery outside deduplication window' where status in ('leased','pending') and first_attempt_at<=now()-interval '23 hours';
 for d in select * from workflow_deliveries where (status='pending' and next_attempt_at<=now()) or (status='leased' and lease_until<=now()) order by next_attempt_at,id for update skip locked limit 25 loop
  select * into n from notifications where id=d.notification_id;
  select * into p from profiles where id=n.recipient_id;
  if not workflow_notification_current(n.id) then
   update workflow_deliveries set status='cancelled',lease_token=null,lease_until=null,last_error='No longer eligible' where id=d.id; continue;
  end if;
  if not p_email_enabled or not coalesce(p.email_notifications,false) or nullif(trim(p.email),'') is null then
   update workflow_deliveries set status='disabled',lease_token=null,lease_until=null,last_error='Email disabled or unconfigured' where id=d.id; continue;
  end if;
  if d.attempts>=6 then update workflow_deliveries set status='failed',last_error='Retry limit reached' where id=d.id; continue; end if;
  token:=gen_random_uuid();
  update workflow_deliveries set status='leased',lease_token=token,lease_until=now()+interval '2 minutes',
   payload=coalesce(payload,jsonb_build_object('from',p_from,'to',p.email,'subject',n.title,'text',n.title||E'\n\n'||coalesce(n.body,'')||E'\n\n'||rtrim(p_app_url,'/')||'/dashboard/board/'||n.board_id||'?card='||n.card_id))
   where id=d.id returning * into d;
  result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'lease_token',token,'payload',d.payload,'provider_key','workflow-'||d.id));
 end loop;
 return result;
end $$;
create or replace function public.workflow_validate_lease(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare d workflow_deliveries; ok boolean;
begin
 select * into d from workflow_deliveries where id=p_id for update;
 if d.status<>'leased' or d.lease_token is distinct from p_token or d.lease_until<=now() then return false; end if;
 select workflow_notification_current(d.notification_id) and coalesce(p.email_notifications,false) and p.email=d.payload->>'to' into ok from notifications n join profiles p on p.id=n.recipient_id where n.id=d.notification_id;
 if not coalesce(ok,false) then update workflow_deliveries set status='cancelled',lease_token=null,lease_until=null,last_error='No longer eligible' where id=d.id; end if;
 if coalesce(ok,false) and d.started_lease_token is distinct from p_token then
  update workflow_deliveries set attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),started_lease_token=p_token where id=d.id;
 end if;
 return coalesce(ok,false);
end $$;
create or replace function public.workflow_finish_delivery(p_id uuid,p_token uuid,p_outcome text,p_provider_id text default null) returns void language plpgsql security definer set search_path=public as $$
declare d workflow_deliveries;
begin
 select * into d from workflow_deliveries where id=p_id for update;
 if d.status<>'leased' or d.lease_token is distinct from p_token then return; end if;
 update workflow_deliveries set status=case when p_outcome='accepted' and p_provider_id is not null then 'accepted' when p_outcome='permanent' or attempts>=6 then 'failed' when first_attempt_at<=now()-interval '23 hours' then 'needs_review' else 'pending' end,
 provider_id=case when p_outcome='accepted' then p_provider_id end,lease_token=null,lease_until=null,next_attempt_at=now()+least(interval '1 hour',interval '30 seconds'*power(2,attempts)),last_error=case when p_outcome='accepted' then null when p_outcome='permanent' then 'Provider rejected delivery' when p_outcome='transient' then 'Temporary provider failure' else 'Provider acknowledgement uncertain' end where id=d.id;
end $$;
create or replace function public.workflow_board_settings(p_board_id uuid,p_payload jsonb default '{"action":"read"}') returns jsonb language plpgsql security definer set search_path=public as $$
declare action text:=p_payload->>'action'; zone text; result jsonb;
begin
 perform 1 from boards where id=p_board_id for update;
 if not exists(select 1 from boards where id=p_board_id and owner_id=auth.uid()) then raise exception 'Board owner access required' using errcode='42501'; end if;
 insert into board_workflow_settings(board_id) values(p_board_id) on conflict do nothing;
 if action='save' then
  zone:=p_payload->>'timezone';
  if jsonb_typeof(p_payload->'scheduling_enabled')<>'boolean' or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Invalid workflow settings' using errcode='22023'; end if;
  update board_workflow_settings set timezone=zone,scheduling_enabled=(p_payload->>'scheduling_enabled')::boolean where board_id=p_board_id;
 elsif action='retry_failed' then
  -- Only definitive transient failures within the immutable provider dedup window are safe.
  update workflow_deliveries set status='pending',attempts=0,next_attempt_at=now() where board_id=p_board_id and status='failed' and last_error='Temporary provider failure' and first_attempt_at>now()-interval '23 hours' and workflow_notification_current(notification_id);
 elsif action is distinct from 'read' then raise exception 'Unknown action' using errcode='22023'; end if;
 select jsonb_build_object('settings',jsonb_build_object('scheduling_enabled',s.scheduling_enabled,'timezone',s.timezone),'health',jsonb_build_object('pending',(select count(*) from workflow_deliveries where board_id=p_board_id and status in ('pending','leased')),'failed',(select count(*) from workflow_deliveries where board_id=p_board_id and status='failed'),'disabled',(select count(*) from workflow_deliveries where board_id=p_board_id and status='disabled'),'needsReview',(select count(*) from workflow_deliveries where board_id=p_board_id and status='needs_review'),'accepted',(select count(*) from workflow_deliveries where board_id=p_board_id and status='accepted'))) into result from board_workflow_settings s where s.board_id=p_board_id;
 return result;
end $$;
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'workflow_%' loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated'; execute 'grant execute on function '||f.signature||' to service_role'; end loop; end $$;
grant execute on function public.workflow_user_board_access(uuid),public.workflow_board_settings(uuid,jsonb) to authenticated;
commit;
