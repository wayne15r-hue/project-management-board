-- Additive identity enforcement. Existing display names are never rewritten.
begin;
alter table public.profiles add column if not exists first_name text, add column if not exists last_name text;
grant select(first_name,last_name) on public.profiles to authenticated;
revoke insert(full_name),update(full_name) on public.profiles from authenticated;
-- New fields are written only by the narrow, permission-checked definer RPCs.
revoke insert(first_name,last_name),update(first_name,last_name) on public.profiles from authenticated;

create or replace function account_private.valid_name(p_value text,p_required boolean) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select case when nullif(trim(p_value),'') is null then not p_required
 else length(trim(p_value))<=100 and p_value !~ '[[:cntrl:]]' end
$$;
revoke all on function account_private.valid_name(text,boolean) from public,anon,authenticated,service_role;

-- SECURITY INVOKER is deliberate: an authenticated direct write cannot claim
-- authority by setting a client-controlled session variable. Only definer RPCs
-- run as the table owner, after their own authorization checks.
create or replace function public.guard_profile_identity() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user in ('authenticated','anon','service_role') and
   (tg_op='INSERT' or new.full_name is distinct from old.full_name or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name) then
  raise exception 'Names are managed through identity setup or central administration' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists profile_identity_guard on public.profiles;
create trigger profile_identity_guard before insert or update on public.profiles for each row execute function public.guard_profile_identity();

create or replace function public.profile_name_ready() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select account_is_active() and exists(select from profiles where id=auth.uid() and nullif(trim(full_name),'') is not null)
$$;
create or replace function public.profile_set_initial_name(p_first text,p_last text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p profiles;
begin
 if not account_is_active() then raise exception 'Active account required' using errcode='42501'; end if;
 if not account_private.valid_name(p_first,true) or not account_private.valid_name(p_last,false) then raise exception 'Check first and last names' using errcode='22023'; end if;
 select * into p from profiles where id=auth.uid() for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 if nullif(trim(p.full_name),'') is not null then raise exception 'Name already set; contact an administrator' using errcode='23505'; end if;
 update profiles set first_name=trim(p_first),last_name=nullif(trim(p_last),''),full_name=concat_ws(' ',trim(p_first),nullif(trim(p_last),'')),updated_at=clock_timestamp() where id=p.id returning * into p;
 return jsonb_build_object('full_name',p.full_name,'first_name',p.first_name,'last_name',p.last_name);
end $$;
create or replace function public.profile_admin_correct_name(p_user uuid,p_first text,p_last text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous profiles; result profiles;
begin
 -- Same serialization order as account status, admin membership and deletion.
 update employee_runtime set revision=revision+1 where singleton;
 if not account_is_active() or employee_admin_role() is null then raise exception 'Central admin required' using errcode='42501'; end if;
 if not account_private.valid_name(p_first,true) or not account_private.valid_name(p_last,false) then raise exception 'Check first and last names' using errcode='22023'; end if;
 select p.* into previous from profiles p join account_private.accounts a on a.id=p.id where p.id=p_user and a.status not in('deleted','deleting') for update of p;
 if not found then raise exception 'Account unavailable for name correction' using errcode='22023'; end if;
 update profiles set first_name=trim(p_first),last_name=nullif(trim(p_last),''),full_name=concat_ws(' ',trim(p_first),nullif(trim(p_last),'')),updated_at=clock_timestamp() where id=p_user returning * into result;
 insert into employee_change_log(actor_id,subject_id,action,before_data,after_data) values(auth.uid(),p_user,'name_corrected',
 jsonb_build_object('full_name',previous.full_name,'first_name',previous.first_name,'last_name',previous.last_name),
 jsonb_build_object('full_name',result.full_name,'first_name',result.first_name,'last_name',result.last_name));
 return jsonb_build_object('full_name',result.full_name,'first_name',result.first_name,'last_name',result.last_name);
end $$;

-- Initial Auth insert only. Updating Auth metadata later is not a name write.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare first_value text; last_value text; display_value text;
begin
 if new.raw_user_meta_data ? 'first_name' then
  first_value=new.raw_user_meta_data->>'first_name';last_value=new.raw_user_meta_data->>'last_name';
  if not account_private.valid_name(first_value,true) or not account_private.valid_name(last_value,false) then raise exception 'Check first and last names' using errcode='22023'; end if;
  first_value=trim(first_value);last_value=nullif(trim(last_value),'');display_value=concat_ws(' ',first_value,last_value);
 else display_value=new.raw_user_meta_data->>'full_name';end if;
 insert into profiles(id,auth_user_id,full_name,first_name,last_name,email) values(new.id,new.id,display_value,first_value,last_value,new.email);
 insert into account_private.accounts(id) values(new.id);
 return new;
end $$;

-- Preserve the existing authorized-deletion transaction and clear new PII.
create or replace function account_private.finalize_auth_delete() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare o account_private.operations;
begin
 update employee_runtime set revision=revision+1 where singleton;
 select * into o from account_private.operations where target_id=old.id and action='delete' and status='running'
 and prepared and lease_until>clock_timestamp() for update;
 if not found or not account_private.operation_valid(o) then raise exception 'Authorized prepared deletion required' using errcode='42501'; end if;
 perform account_private.lock_transfers();
 if account_private.has_media(o.id) or exists(select from account_private.requirements(old.id))
 or exists(select from storage.objects where bucket_id='avatars' and split_part(name,'/',1)=old.id::text) then
  raise exception 'Account cleanup incomplete' using errcode='40001'; end if;
 delete from employee_records where user_id=old.id;
 delete from account_private.directory where id=old.id;
 update employee_change_log set before_data=null,after_data=null where subject_id=old.id;
 delete from board_favorites where user_id=old.id;
 update profiles set full_name='Deleted user',first_name=null,last_name=null,email='deleted+'||old.id||'@invalid.example',avatar_url=null,anthropic_api_key=null,
 ai_enabled=false,email_notifications=false,auth_user_id=null,updated_at=clock_timestamp() where id=old.id;
 update approval_history set actor_name='Deleted user' where actor_id=old.id;
 update account_private.accounts set status='deleted',revision=revision+1 where id=old.id;
 perform account_private.record_outcome(o.id,'succeeded',null);
 return old;
end $$;
revoke all on function public.profile_name_ready(),public.profile_set_initial_name(text,text),public.profile_admin_correct_name(uuid,text,text),public.guard_profile_identity() from public,anon,service_role;
grant execute on function public.profile_name_ready(),public.profile_set_initial_name(text,text),public.profile_admin_correct_name(uuid,text,text) to authenticated;
commit;
