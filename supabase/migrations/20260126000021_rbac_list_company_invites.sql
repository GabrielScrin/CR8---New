-- RBAC: list invites via SECURITY DEFINER RPC
-- Avoids relying on direct SELECT privileges / RLS from the client for company_invites.

create extension if not exists pgcrypto;

create or replace function public.list_company_invite_links(p_company_id uuid)
returns table (
  id uuid,
  email text,
  member_role text,
  created_at timestamptz,
  accepted_at timestamptz,
  token text,
  expires_at timestamptz,
  used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_identity_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select to_regprocedure('public.is_company_identity_admin(uuid)') is not null
  into has_identity_admin;

  if has_identity_admin then
    if not public.is_company_identity_admin(p_company_id) then
      raise exception 'not authorized';
    end if;
  else
    if not public.is_company_admin(p_company_id) then
      raise exception 'not authorized';
    end if;
  end if;

  return query
  select
    ci.id,
    ci.email,
    ci.member_role,
    ci.created_at,
    ci.accepted_at,
    ci.token,
    ci.expires_at,
    ci.used_at
  from public.company_invites ci
  where ci.company_id = p_company_id
  order by ci.created_at desc;
end;
$$;

grant execute on function public.list_company_invite_links(uuid) to authenticated;

