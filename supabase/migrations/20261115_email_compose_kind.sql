alter table email_private.drafts add column if not exists compose_kind text
  check (compose_kind in ('new', 'reply', 'forward'));

-- Keep the five-argument RPC for older clients. This overload records the
-- compose kind on creation in the same transaction as the versioned save.
create or replace function public.email_save_draft(
  p_id uuid, p_version int, p_subject text, p_body text, p_recipients jsonb, p_compose_kind text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved jsonb;
begin
  if p_compose_kind is null or p_compose_kind not in ('new', 'reply', 'forward') then
    raise exception 'Invalid email compose kind.' using errcode = '22023';
  end if;
  saved := public.email_save_draft(p_id, p_version, p_subject, p_body, p_recipients);
  if p_version = 0 then
    update email_private.drafts set compose_kind = p_compose_kind
      where id = p_id and user_id = auth.uid();
  end if;
  return saved;
end
$$;

revoke all on function public.email_save_draft(uuid,int,text,text,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.email_save_draft(uuid,int,text,text,jsonb,text) to authenticated;

create or replace function public.email_get_draft(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := email_private.require_user();
  draft email_private.drafts;
begin
  select * into draft from email_private.drafts where id=p_id and user_id=viewer;
  if not found then raise exception 'Draft not found.' using errcode='P0404'; end if;
  return jsonb_build_object('id',draft.id,'version',draft.version,'subject',draft.subject,'body',draft.body,
    'composeKind',draft.compose_kind,'attachments',email_private.attachment_list(draft.id,null),'recipients',(
      select coalesce(jsonb_agg(v || jsonb_build_object('name',coalesce(p.full_name,'Helios user')) order by ordinality),'[]')
      from jsonb_array_elements(draft.recipients) with ordinality a(v,ordinality)
      left join public.profiles p on p.id=(v->>'id')::uuid
    ));
end
$$;
