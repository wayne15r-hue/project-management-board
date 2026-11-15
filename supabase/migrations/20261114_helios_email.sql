begin;

create schema if not exists email_private;
revoke all on schema email_private from public, anon, authenticated, service_role;
create table if not exists email_private.settings (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'off' check (mode in ('off','pilot','all'))
);
insert into email_private.settings default values on conflict (singleton) do nothing;
create table if not exists email_private.pilot_users (
  user_id uuid primary key references public.profiles(id)
);

create table if not exists email_private.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  subject text not null check (length(subject) <= 200),
  body text not null check (length(body) <= 50000),
  sent_at timestamptz not null,
  search_document tsvector generated always as (
    to_tsvector('simple'::regconfig, subject || ' ' || body)
  ) stored
);
create index if not exists email_message_search on email_private.messages using gin (search_document);
create table if not exists email_private.recipients (
  message_id uuid not null references email_private.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('to','cc','bcc')),
  primary key (message_id, user_id)
);
create table if not exists email_private.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  message_id uuid not null references email_private.messages(id),
  direction text not null check (direction in ('inbox','sent')),
  folder text not null check (folder in ('inbox','sent','archive','trash')),
  prior_folder text check (prior_folder in ('inbox','sent','archive')),
  trashed_at timestamptz,
  is_read boolean not null,
  sent_at timestamptz not null,
  unique (user_id, message_id, direction),
  check ((folder = 'trash') = (trashed_at is not null and prior_folder is not null))
);
create index if not exists email_entry_list on email_private.entries (user_id, folder, sent_at desc, id desc);
create index if not exists email_entry_message on email_private.entries (message_id);
create index if not exists email_entry_trash on email_private.entries (trashed_at) where folder = 'trash';
create index if not exists email_entry_unread on email_private.entries (user_id) where folder = 'inbox' and not is_read;

create table if not exists email_private.drafts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  version int not null default 1,
  subject text not null check (length(subject) <= 200),
  body text not null check (length(body) <= 50000),
  recipients jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists email_draft_list on email_private.drafts (user_id, updated_at desc, id desc);
-- The client-generated draft UUID is also its send idempotency key.
create table if not exists email_private.sends (
  user_id uuid not null references public.profiles(id),
  draft_id uuid not null,
  entry_id uuid not null,
  sent_at timestamptz not null,
  primary key (user_id, draft_id)
);
create index if not exists email_send_rate on email_private.sends (user_id, sent_at desc);

create table if not exists email_private.files (
  id uuid primary key,
  uploader_id uuid not null references public.profiles(id),
  name text not null check (length(name) between 1 and 180),
  mime text not null check (mime in ('application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain')),
  bytes int not null check (bytes between 1 and 3000000),
  state text not null default 'pending' check (state in ('pending','ready','deleting')),
  created_at timestamptz not null default now(),
  cleanup_after timestamptz not null default now()
);
create index if not exists email_file_quota on email_private.files (uploader_id);
create index if not exists email_file_cleanup on email_private.files (cleanup_after);
create table if not exists email_private.attachments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references email_private.files(id),
  draft_id uuid references email_private.drafts(id) on delete cascade,
  message_id uuid references email_private.messages(id) on delete cascade,
  check ((draft_id is null) <> (message_id is null)),
  unique (draft_id, file_id),
  unique (message_id, file_id)
);
create index if not exists email_file_reference on email_private.attachments (file_id);

alter table email_private.settings enable row level security;
alter table email_private.pilot_users enable row level security;
alter table email_private.messages enable row level security;
alter table email_private.recipients enable row level security;
alter table email_private.entries enable row level security;
alter table email_private.drafts enable row level security;
alter table email_private.sends enable row level security;
alter table email_private.files enable row level security;
alter table email_private.attachments enable row level security;
revoke all on all tables in schema email_private from public, anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('helios-email', 'helios-email', false, 3000000, array[
  'application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain'
]) on conflict (id) do nothing;
drop policy if exists email_storage_server_only on storage.objects;
create policy email_storage_server_only on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'helios-email') with check (bucket_id <> 'helios-email');

create or replace function email_private.eligible(p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select from email_private.settings s
    join account_private.accounts a on a.id = p_user and a.status = 'active'
    join public.profiles p on p.id = a.id and p.auth_user_id = a.id and nullif(trim(p.full_name),'') is not null
    join public.employee_records e on e.user_id = a.id and e.completed_at is not null
    where s.mode = 'all' or (
      s.mode = 'pilot' and exists (select from email_private.pilot_users where user_id = a.id)
    )
  )
$$;

create or replace function public.email_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select email_private.eligible(auth.uid())
$$;

create or replace function email_private.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if not email_private.eligible(auth.uid()) then
    raise exception 'Email is unavailable for this account.' using errcode = '42501';
  end if;
  return auth.uid();
end
$$;

drop policy if exists email_receive_broadcast on realtime.messages;
create policy email_receive_broadcast on realtime.messages for select to authenticated
using (extension = 'broadcast' and (select public.email_enabled())
  and (select realtime.topic()) = 'email:' || (select auth.uid())::text);

create or replace function email_private.broadcast_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'mailbox', 'email:' || coalesce(new.user_id, old.user_id)::text, true);
  return null;
end
$$;
drop trigger if exists email_entry_change on email_private.entries;
create trigger email_entry_change after insert or update or delete on email_private.entries
for each row execute function email_private.broadcast_entry();

create or replace function public.email_directory(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  term text := trim(p_query);
begin
  if length(term) not between 2 and 254 or term is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', id, 'name', full_name, 'email', exact_email))
      order by exact_email is null, full_name, id)
    from (
      select p.id, p.full_name, case when lower(u.email) = lower(term) then u.email end as exact_email
      from public.profiles p join auth.users u on u.id = p.id
      where p.id <> viewer and email_private.eligible(p.id)
        and (strpos(lower(p.full_name), lower(term)) > 0 or lower(u.email) = lower(term))
      order by lower(u.email) = lower(term) desc nulls last, p.full_name, p.id limit 20
    ) matches
  ), '[]'::jsonb);
end
$$;

create or replace function email_private.valid_recipients(p_list jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_list) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_list) > 20 then return false; end if;
  return not exists (
    select from jsonb_array_elements(p_list) v
    where jsonb_typeof(v) <> 'object'
      or coalesce(v->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v->>'kind','') not in ('to','cc','bcc')
  ) and (select count(distinct lower(v->>'id')) from jsonb_array_elements(p_list) v) = jsonb_array_length(p_list);
end
$$;

create or replace function public.email_save_draft(p_id uuid, p_version int, p_subject text, p_body text, p_recipients jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  saved email_private.drafts;
  addresses jsonb;
begin
  if p_id is null or p_version is null or p_version < 0 or p_subject is null or length(p_subject) > 200
    or p_body is null or length(p_body) > 50000 or not email_private.valid_recipients(p_recipients) then
    raise exception 'Check the message fields and use up to 20 distinct recipients.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'kind',v->>'kind') order by ordinality),'[]')
    into addresses from jsonb_array_elements(p_recipients) with ordinality a(v, ordinality);
  perform pg_advisory_xact_lock(hashtextextended('email:user:' || viewer::text, 0));
  if exists (select from email_private.sends where user_id = viewer and draft_id = p_id) then
    raise exception 'This draft was already sent.' using errcode = '40001';
  end if;
  if p_version = 0 then
    insert into email_private.drafts(id,user_id,subject,body,recipients)
    values(p_id,viewer,p_subject,p_body,addresses)
    on conflict (id) do nothing returning * into saved;
  else
    update email_private.drafts set subject=p_subject, body=p_body, recipients=addresses,
      updated_at=clock_timestamp(), version=version+1
    where id=p_id and user_id=viewer and version=p_version returning * into saved;
  end if;
  if not found then raise exception 'This draft changed elsewhere.' using errcode = '40001'; end if;
  return jsonb_build_object('id',saved.id,'version',saved.version);
end
$$;

create or replace function public.email_delete_draft(p_id uuid,p_version int) returns void
language plpgsql security definer set search_path = '' as $$
declare viewer uuid := email_private.require_user();
begin
  delete from email_private.drafts where id=p_id and user_id=viewer and version=p_version;
  if not found then raise exception 'This draft changed elsewhere.' using errcode='40001'; end if;
end
$$;

create or replace function public.email_send(p_id uuid,p_version int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  draft email_private.drafts;
  sent_id uuid;
  message uuid;
  sent_time timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('email:user:' || viewer::text, 0));
  -- Lock the pilot policy and affected account rows until delivery commits.
  perform 1 from email_private.settings for share;
  perform 1 from email_private.pilot_users where user_id=viewer for share;
  perform email_private.require_user();
  select entry_id into sent_id from email_private.sends where user_id=viewer and draft_id=p_id;
  if found then return jsonb_build_object('id',sent_id); end if;

  select * into draft from email_private.drafts where id=p_id and user_id=viewer for update;
  if not found or draft.version is distinct from p_version then
    raise exception 'This draft changed elsewhere.' using errcode='40001';
  end if;
  if jsonb_array_length(draft.recipients) = 0 then
    raise exception 'Add at least one recipient.' using errcode='22023';
  end if;
  perform 1 from account_private.accounts
    where id=viewer or id in (select (v->>'id')::uuid from jsonb_array_elements(draft.recipients) v)
    order by id for share;
  perform 1 from email_private.pilot_users
    where user_id in (select (v->>'id')::uuid from jsonb_array_elements(draft.recipients) v)
    order by user_id for share;
  perform email_private.require_user();
  if exists (
    select from jsonb_array_elements(draft.recipients) v
    where not email_private.eligible((v->>'id')::uuid)
  ) then raise exception 'One or more recipients are unavailable.' using errcode='22023'; end if;

  if exists (select from email_private.attachments a join email_private.files f on f.id=a.file_id
    where a.draft_id=draft.id and f.state<>'ready') then
    raise exception 'Wait for attachments to finish uploading.' using errcode='40001';
  end if;
  sent_time := clock_timestamp();
  if exists (
    select from email_private.sends where user_id=viewer and sent_at > sent_time - interval '24 hours'
    having count(*) >= 200 or count(*) filter (where sent_at > sent_time - interval '1 hour') >= 50
  ) then raise exception 'Send limit reached. Try again later.' using errcode='P0429'; end if;

  insert into email_private.messages(sender_id,subject,body,sent_at)
    values(viewer,draft.subject,draft.body,sent_time) returning id into message;
  insert into email_private.recipients(message_id,user_id,kind)
    select message,(v->>'id')::uuid,v->>'kind' from jsonb_array_elements(draft.recipients) v;
  insert into email_private.entries(user_id,message_id,direction,folder,is_read,sent_at)
    values(viewer,message,'sent','sent',true,sent_time) returning id into sent_id;
  insert into email_private.entries(user_id,message_id,direction,folder,is_read,sent_at)
    select user_id,message,'inbox','inbox',false,sent_time from email_private.recipients where message_id=message;
  update email_private.attachments set draft_id=null,message_id=message where draft_id=draft.id;
  insert into email_private.sends(user_id,draft_id,entry_id,sent_at) values(viewer,draft.id,sent_id,sent_time);
  delete from email_private.drafts where id=draft.id;
  return jsonb_build_object('id',sent_id);
end
$$;

create or replace function public.email_list(p_folder text,p_query text,p_unread boolean,p_offset int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  term text := trim(coalesce(p_query,''));
  results jsonb;
begin
  if p_folder is null or p_folder not in ('inbox','sent','drafts','archive','trash')
    or p_offset is null or p_offset < 0 or length(term) > 254 then
    raise exception 'Check the folder or search fields.' using errcode='22023';
  end if;
  if p_folder='drafts' then
    select jsonb_agg(to_jsonb(r) - 'sort_time' order by sort_time desc,id desc) into results from (
      select d.id,d.subject,d.updated_at as "sentAt",d.updated_at as sort_time
      from email_private.drafts d where d.user_id=viewer
        and (term='' or to_tsvector('simple'::regconfig,d.subject||' '||d.body) @@ websearch_to_tsquery('simple'::regconfig,term))
      order by d.updated_at desc,d.id desc limit 26 offset p_offset
    ) r;
  else
    select jsonb_agg(to_jsonb(r) order by "sentAt" desc,id desc) into results from (
      select e.id,m.subject,e.sent_at as "sentAt", e.is_read as "isRead",
        coalesce(p.full_name,'Helios user') as sender,
        case when e.direction='sent' then (
          select string_agg(coalesce(rp.full_name,'Helios user'),', ' order by r.kind,r.user_id)
          from email_private.recipients r join public.profiles rp on rp.id=r.user_id
          where r.message_id=m.id
        ) end as recipients
      from email_private.entries e join email_private.messages m on m.id=e.message_id
      join public.profiles p on p.id=m.sender_id left join auth.users u on u.id=m.sender_id
      where e.user_id=viewer and e.folder=p_folder and (not coalesce(p_unread,false) or not e.is_read)
        and (term='' or m.search_document @@ websearch_to_tsquery('simple'::regconfig,term)
          or strpos(lower(p.full_name),lower(term)) > 0 or lower(u.email)=lower(term))
      order by e.sent_at desc,e.id desc limit 26 offset p_offset
    ) r;
  end if;
  results := coalesce(results,'[]');
  return jsonb_build_object('items',results - 25,'nextOffset',case when jsonb_array_length(results)>25 then p_offset+25 end);
end
$$;

create or replace function email_private.attachment_list(p_draft uuid,p_message uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',f.name,'bytes',f.bytes)
    order by f.created_at,a.id),'[]')
  from email_private.attachments a join email_private.files f on f.id=a.file_id
  where f.state='ready' and (a.draft_id=p_draft or a.message_id=p_message)
$$;

create or replace function public.email_get_draft(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  draft email_private.drafts;
begin
  select * into draft from email_private.drafts where id=p_id and user_id=viewer;
  if not found then raise exception 'Draft not found.' using errcode='P0404'; end if;
  return jsonb_build_object('id',draft.id,'version',draft.version,'subject',draft.subject,'body',draft.body,
    'attachments',email_private.attachment_list(draft.id,null),'recipients',(
      select coalesce(jsonb_agg(v || jsonb_build_object('name',coalesce(p.full_name,'Helios user')) order by ordinality),'[]')
      from jsonb_array_elements(draft.recipients) with ordinality a(v,ordinality)
      left join public.profiles p on p.id=(v->>'id')::uuid
    ));
end
$$;

create or replace function public.email_unread_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from email_private.entries where user_id=email_private.require_user()
    and folder='inbox' and not is_read
$$;

create or replace function public.email_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  entry email_private.entries;
  message email_private.messages;
  blind boolean;
begin
  select * into entry from email_private.entries where id=p_id and user_id=viewer for update;
  if not found then raise exception 'Message not found.' using errcode='P0404'; end if;
  if not entry.is_read then update email_private.entries set is_read=true where id=entry.id; end if;
  select * into strict message from email_private.messages where id=entry.message_id;
  blind := message.sender_id <> viewer and exists (
    select from email_private.recipients where message_id=message.id and user_id=viewer and kind='bcc'
  );
  return jsonb_build_object('id',entry.id,'direction',entry.direction,'folder',entry.folder,
    'sentAt',message.sent_at,'subject',message.subject,'body',message.body,'isBcc',blind,
    'sender',(select jsonb_build_object('id',id,'name',coalesce(full_name,'Helios user'),
      'eligible',email_private.eligible(id)) from public.profiles where id=message.sender_id),
    'attachments',email_private.attachment_list(null,message.id),'recipients',(
      select coalesce(jsonb_agg(jsonb_build_object('id',r.user_id,'kind',r.kind,'name',coalesce(p.full_name,'Helios user'),
        'eligible',email_private.eligible(r.user_id))
        order by case r.kind when 'to' then 1 when 'cc' then 2 else 3 end, r.user_id),'[]')
      from email_private.recipients r join public.profiles p on p.id=r.user_id
      where r.message_id=message.id and (r.kind<>'bcc' or message.sender_id=viewer or r.user_id=viewer)
    ));
end
$$;

create or replace function public.email_mailbox_action(p_id uuid,p_action text) returns int
language plpgsql security definer set search_path = '' as $$
declare viewer uuid := email_private.require_user();
begin
  if p_action='read_all' then
    update email_private.entries set is_read=true where user_id=viewer and folder='inbox' and not is_read;
  else
    perform 1 from email_private.entries where id=p_id and user_id=viewer for update;
    if not found then raise exception 'Message not found.' using errcode='P0404'; end if;
    case p_action
      when 'read','unread' then
        update email_private.entries set is_read=(p_action='read') where id=p_id and is_read<>(p_action='read');
      when 'archive' then
        update email_private.entries set folder='archive' where id=p_id and folder in ('inbox','sent');
      when 'trash' then
        update email_private.entries set prior_folder=folder,folder='trash',trashed_at=clock_timestamp()
          where id=p_id and folder<>'trash';
      when 'restore' then
        update email_private.entries set folder=prior_folder,prior_folder=null,trashed_at=null where id=p_id and folder='trash';
      when 'unarchive' then
        update email_private.entries set folder=direction where id=p_id and folder='archive';
      else raise exception 'Unknown mailbox action.' using errcode='22023';
    end case;
  end if;
  return public.email_unread_count();
end
$$;

create or replace function public.email_reserve_upload(p_draft uuid,p_file uuid,p_name text,p_mime text,p_bytes int,p_user uuid,p_version int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not email_private.eligible(p_user) then raise exception 'Email is unavailable.' using errcode='42501'; end if;
  if p_bytes is null or p_bytes not between 1 and 3000000 then
    raise exception 'Each file must be 3 MB or smaller.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email:user:' || p_user::text, 0));
  perform 1 from email_private.drafts where id=p_draft and user_id=p_user and version=p_version for update;
  if not found then raise exception 'This draft changed elsewhere.' using errcode='40001'; end if;
  if (select count(*) from email_private.attachments where draft_id=p_draft)>=3 then
    raise exception 'Attach up to three files.' using errcode='22023';
  end if;
  if (select coalesce(sum(bytes),0) from email_private.files where uploader_id=p_user)+p_bytes > 100000000 then
    raise exception 'Your attachment storage quota is full.' using errcode='P0429';
  end if;
  insert into email_private.files(id,uploader_id,name,mime,bytes) values (p_file,p_user,p_name,p_mime,p_bytes);
  insert into email_private.attachments(draft_id,file_id) values(p_draft,p_file);
end
$$;

create or replace function public.email_finish_upload(p_draft uuid,p_file uuid,p_user uuid,p_success boolean,p_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item uuid;
  current_version int;
begin
  select version into current_version from email_private.drafts where id=p_draft and user_id=p_user for update;
  if found then
    select a.id into item from email_private.attachments a join email_private.files f on f.id=a.file_id
      where a.draft_id=p_draft and a.file_id=p_file and f.state='pending' and f.uploader_id=p_user;
  end if;
  if p_success and item is not null and current_version=p_version and email_private.eligible(p_user) then
    update email_private.files set state='ready' where id=p_file;
    update email_private.drafts set version=version+1,updated_at=clock_timestamp() where id=p_draft
      returning version into current_version;
    return jsonb_build_object('id',item,'version',current_version);
  end if;
  if item is not null then delete from email_private.attachments where id=item; end if;
  -- Keep quota reserved until Storage removal is confirmed.
  return jsonb_build_object('conflict',p_success and current_version is distinct from p_version);
end
$$;

create or replace function public.email_remove_attachment(p_draft uuid,p_attachment uuid,p_version int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  next_version int := p_version;
begin
  perform 1 from email_private.drafts where id=p_draft and user_id=viewer and version=p_version for update;
  if not found then raise exception 'This draft changed elsewhere.' using errcode='40001'; end if;
  delete from email_private.attachments where id=p_attachment and draft_id=p_draft;
  if found then
    update email_private.drafts set version=version+1,updated_at=clock_timestamp() where id=p_draft
      returning version into next_version;
  end if;
  return next_version;
end
$$;

create or replace function public.email_forward_files(p_draft uuid,p_source uuid,p_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  source_message uuid;
  next_version int := p_version;
begin
  perform 1 from email_private.drafts where id=p_draft and user_id=viewer and version=p_version for update;
  if not found then raise exception 'This draft changed elsewhere.' using errcode='40001'; end if;
  select message_id into source_message from email_private.entries where id=p_source and user_id=viewer for share;
  if not found then raise exception 'Message not found.' using errcode='P0404'; end if;
  if (select count(distinct file_id) from email_private.attachments
      where draft_id=p_draft or message_id=source_message)>3 then
    raise exception 'Attach up to three files.' using errcode='22023';
  end if;
  insert into email_private.attachments(draft_id,file_id)
    select p_draft,file_id from email_private.attachments where message_id=source_message
    on conflict (draft_id,file_id) do nothing;
  if found then
    update email_private.drafts set version=version+1,updated_at=clock_timestamp() where id=p_draft
      returning version into next_version;
  end if;
  return jsonb_build_object('version',next_version,'attachments',email_private.attachment_list(p_draft,null));
end
$$;

create or replace function public.email_attachment_access(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  file email_private.files;
begin
  select f.* into file from email_private.attachments a join email_private.files f on f.id=a.file_id
    where a.id=p_id and f.state='ready' and (
      exists(select from email_private.entries e where e.user_id=viewer and e.message_id=a.message_id)
      or exists(select from email_private.drafts d where d.user_id=viewer and d.id=a.draft_id)
    );
  if not found then raise exception 'Attachment not found.' using errcode='P0404'; end if;
  return jsonb_build_object('path',file.id,'name',file.name,'mime',file.mime);
end
$$;

create or replace function public.email_claim_cleanup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  claimed jsonb;
  changed int;
  purged int;
begin
  if not exists (select from email_private.settings where mode<>'off') then return '[]'::jsonb; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('email:maintenance',0)) then return '[]'::jsonb; end if;
  delete from email_private.entries where id in (
    select id from email_private.entries where folder='trash' and trashed_at<=now()-interval '30 days'
    order by trashed_at,id limit 100 for update skip locked
  );
  get diagnostics purged = row_count;
  delete from email_private.messages m where m.id in (
    select candidate.id from email_private.messages candidate
    where not exists(select from email_private.entries e where e.message_id=candidate.id)
    limit 100
  );
  get diagnostics changed = row_count;
  purged := purged + changed;
  -- Lock each draft before releasing expired pending uploads, as send does.
  with expired as (
    select a.id from email_private.attachments a join email_private.files f on f.id=a.file_id
      join email_private.drafts d on d.id=a.draft_id
    where f.state='pending' and f.created_at<=now()-interval '24 hours'
    limit 100 for update of d skip locked
  )
  delete from email_private.attachments a using expired where a.id=expired.id;
  get diagnostics changed = row_count;
  purged := purged + changed;
  with candidates as (
    select f.id from email_private.files f where f.cleanup_after<=now()
      and (f.state<>'pending' or f.created_at<=now()-interval '24 hours')
      and not exists(select from email_private.attachments a where a.file_id=f.id)
    order by f.cleanup_after,f.id limit 20 for update skip locked
  ), leased as (
    update email_private.files f set state='deleting',cleanup_after=now()+interval '10 minutes'
    from candidates c where f.id=c.id returning f.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',id)),'[]') into claimed from leased;
  return jsonb_build_object('jobs',claimed,'purged',purged);
end
$$;

create or replace function public.email_finish_cleanup(p_id uuid,p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_success then delete from email_private.files where id=p_id and state='deleting';
  else update email_private.files set cleanup_after=now()+interval '15 minutes'
    where id=p_id and state='deleting';
  end if;
end
$$;

create or replace function public.email_project_storage_bytes() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((metadata->>'size')::bigint),0)::bigint
  from storage.objects where (metadata->>'size') ~ '^[0-9]{1,18}$'
$$;
revoke all on all functions in schema email_private from public, anon, authenticated, service_role;
revoke all on function public.email_enabled(),public.email_directory(text),
  public.email_save_draft(uuid,int,text,text,jsonb),public.email_get_draft(uuid),public.email_delete_draft(uuid,int),
  public.email_send(uuid,int),public.email_list(text,text,boolean,int),public.email_unread_count(),
  public.email_detail(uuid),public.email_mailbox_action(uuid,text),public.email_forward_files(uuid,uuid,int),
  public.email_remove_attachment(uuid,uuid,int),public.email_attachment_access(uuid),
  public.email_reserve_upload(uuid,uuid,text,text,int,uuid,int),public.email_finish_upload(uuid,uuid,uuid,boolean,int),
  public.email_claim_cleanup(),public.email_finish_cleanup(uuid,boolean),public.email_project_storage_bytes()
from public, anon, authenticated, service_role;
grant execute on function public.email_enabled(),public.email_directory(text),
  public.email_save_draft(uuid,int,text,text,jsonb),public.email_get_draft(uuid),public.email_delete_draft(uuid,int),
  public.email_send(uuid,int),public.email_list(text,text,boolean,int),public.email_unread_count(),
  public.email_detail(uuid),public.email_mailbox_action(uuid,text),public.email_forward_files(uuid,uuid,int),
  public.email_remove_attachment(uuid,uuid,int),public.email_attachment_access(uuid) to authenticated;
grant execute on function public.email_reserve_upload(uuid,uuid,text,text,int,uuid,int),
  public.email_finish_upload(uuid,uuid,uuid,boolean,int),public.email_claim_cleanup(),public.email_finish_cleanup(uuid,boolean),public.email_project_storage_bytes()
to service_role;

notify pgrst, 'reload schema';
commit;
