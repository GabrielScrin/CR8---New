-- Phase RBAC (Admin-only identity management)
-- - Only admins can manage: invites, member roles, removals
-- - Keeps 'gestor' as "company admin" for operational tasks, but not for identity

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper: admin-only check (bypasses RLS inside)
-- -----------------------------------------------------------------------------

create or replace function public.is_company_identity_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.member_role = 'admin'
  );
$$;

grant execute on function public.is_company_identity_admin(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Policies: company_invites should be admin-only
-- -----------------------------------------------------------------------------

alter table public.company_invites enable row level security;

drop policy if exists "Admins can read company invites" on public.company_invites;
create policy "Admins can read company invites"
on public.company_invites
for select
using (public.is_company_identity_admin(company_id));

drop policy if exists "Admins can create company invites" on public.company_invites;
create policy "Admins can create company invites"
on public.company_invites
for insert
with check (public.is_company_identity_admin(company_id));

drop policy if exists "Admins can revoke company invites" on public.company_invites;
create policy "Admins can revoke company invites"
on public.company_invites
for delete
using (public.is_company_identity_admin(company_id));

-- -----------------------------------------------------------------------------
-- RPCs: restrict identity ops to admin-only
-- -----------------------------------------------------------------------------

create or replace function public.list_company_members(p_company_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  member_role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    m.user_id,
    u.email,
    u.full_name,
    u.avatar_url,
    m.member_role,
    m.created_at
  from public.company_members m
  join public.users u on u.id = m.user_id
  where m.company_id = p_company_id
    and public.is_company_identity_admin(p_company_id)
  order by
    case m.member_role
      when 'admin' then 1
      when 'gestor' then 2
      when 'vendedor' then 3
      else 4
    end,
    m.created_at asc;
$$;

grant execute on function public.list_company_members(uuid) to authenticated;

create or replace function public.create_company_invite(
  p_company_id uuid,
  p_email text,
  p_member_role text default 'cliente'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_role text;
  v_invite_id uuid;
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_identity_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'invalid email';
  end if;

  v_role := lower(trim(coalesce(p_member_role, 'cliente')));
  if v_role = 'empresa' then
    v_role := 'cliente';
  end if;
  if v_role not in ('admin', 'gestor', 'cliente', 'vendedor') then
    raise exception 'invalid member role';
  end if;

  insert into public.company_invites (company_id, email, member_role, created_by, token, expires_at)
  values (p_company_id, v_email, v_role, auth.uid(), null, null)
  on conflict (company_id, lower(email)) do update
  set
    member_role = excluded.member_role,
    created_by = excluded.created_by,
    created_at = now(),
    accepted_at = null,
    accepted_by = null,
    used_at = null,
    token = null,
    expires_at = null
  returning id into v_invite_id;

  -- Auto-accept if the user already exists.
  select au.id
  into v_user_id
  from auth.users au
  where lower(au.email) = v_email
  limit 1;

  if v_user_id is not null then
    insert into public.company_members (company_id, user_id, member_role)
    values (p_company_id, v_user_id, v_role)
    on conflict (company_id, user_id) do update
    set member_role = excluded.member_role;

    update public.company_invites
    set accepted_at = now(), accepted_by = v_user_id, used_at = now()
    where id = v_invite_id;
  end if;

  return v_invite_id;
end;
$$;

grant execute on function public.create_company_invite(uuid, text, text) to authenticated;

create or replace function public.create_company_invite_link(
  p_company_id uuid,
  p_member_role text default 'cliente',
  p_expires_in_days int default 30,
  p_email text default null
)
returns table (
  invite_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_email text;
  v_token text;
  v_expires timestamptz;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_identity_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  v_role := lower(trim(coalesce(p_member_role, 'cliente')));
  if v_role = 'empresa' then
    v_role := 'cliente';
  end if;
  if v_role not in ('admin', 'gestor', 'cliente', 'vendedor') then
    raise exception 'invalid member role';
  end if;

  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'invalid email';
  end if;

  if p_expires_in_days is null or p_expires_in_days <= 0 then
    v_expires := null; -- never expires
  else
    v_expires := now() + make_interval(days => p_expires_in_days);
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  if v_email is null then
    insert into public.company_invites (company_id, email, member_role, created_by, token, expires_at, accepted_at, accepted_by, used_at)
    values (p_company_id, null, v_role, auth.uid(), v_token, v_expires, null, null, null)
    returning id into v_invite_id;
  else
    insert into public.company_invites (company_id, email, member_role, created_by, token, expires_at, accepted_at, accepted_by, used_at)
    values (p_company_id, v_email, v_role, auth.uid(), v_token, v_expires, null, null, null)
    on conflict (company_id, lower(email)) do update
    set
      member_role = excluded.member_role,
      created_by = excluded.created_by,
      created_at = now(),
      accepted_at = null,
      accepted_by = null,
      used_at = null,
      token = excluded.token,
      expires_at = excluded.expires_at
    returning id into v_invite_id;
  end if;

  return query select v_invite_id, v_token, v_expires;
end;
$$;

grant execute on function public.create_company_invite_link(uuid, text, int, text) to authenticated;

create or replace function public.revoke_company_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.company_invites
  where id = p_invite_id;

  if v_company_id is null then
    return;
  end if;

  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_identity_admin(v_company_id) then
    raise exception 'not authorized';
  end if;

  delete from public.company_invites
  where id = p_invite_id;
end;
$$;

grant execute on function public.revoke_company_invite(uuid) to authenticated;

create or replace function public.set_company_member_role(
  p_company_id uuid,
  p_user_id uuid,
  p_member_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_identity_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  v_role := lower(trim(coalesce(p_member_role, 'cliente')));
  if v_role = 'empresa' then
    v_role := 'cliente';
  end if;
  if v_role not in ('admin', 'gestor', 'cliente', 'vendedor') then
    raise exception 'invalid member role';
  end if;

  update public.company_members
  set member_role = v_role
  where company_id = p_company_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.set_company_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_company_member(
  p_company_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
  v_admin_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_identity_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot remove yourself';
  end if;

  select member_role into v_target_role
  from public.company_members
  where company_id = p_company_id
    and user_id = p_user_id;

  if v_target_role = 'admin' then
    select count(*) into v_admin_count
    from public.company_members
    where company_id = p_company_id
      and member_role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'cannot remove the last admin';
    end if;
  end if;

  delete from public.company_members
  where company_id = p_company_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.remove_company_member(uuid, uuid) to authenticated;

