-- Phase RBAC + Invite Links (/join)
-- - Normalize role naming: empresa -> cliente
-- - Add link-based invites (token + expiry + used_at)
-- - Provide RPCs for: create invite link, validate token, accept token

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Roles: normalize legacy 'empresa' -> 'cliente'
-- -----------------------------------------------------------------------------

update public.users
set role = 'cliente'
where role = 'empresa';

update public.company_members
set member_role = 'cliente'
where member_role = 'empresa';

update public.company_invites
set member_role = 'cliente'
where member_role = 'empresa';

-- Update CHECK constraints (names are the Postgres defaults when using inline CHECKs)
alter table public.users drop constraint if exists users_role_check;
alter table public.users
add constraint users_role_check
check (role in ('admin', 'gestor', 'cliente', 'vendedor'));

alter table public.company_members drop constraint if exists company_members_member_role_check;
alter table public.company_members
add constraint company_members_member_role_check
check (member_role in ('admin', 'gestor', 'cliente', 'vendedor'));

alter table public.company_invites drop constraint if exists company_invites_member_role_check;
alter table public.company_invites
add constraint company_invites_member_role_check
check (member_role in ('admin', 'gestor', 'cliente', 'vendedor'));

-- -----------------------------------------------------------------------------
-- Invites: allow link-based flow (token + expiry)
-- -----------------------------------------------------------------------------

alter table public.company_invites alter column email drop not null;

alter table public.company_invites add column if not exists token text;
alter table public.company_invites add column if not exists expires_at timestamptz;
alter table public.company_invites add column if not exists used_at timestamptz;

-- Backfill used_at for already accepted invites
update public.company_invites
set used_at = accepted_at
where used_at is null
  and accepted_at is not null;

create unique index if not exists company_invites_token_uq
  on public.company_invites (token)
  where token is not null;

create index if not exists company_invites_active_idx
  on public.company_invites (company_id, created_at desc)
  where accepted_at is null and used_at is null;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Create a link-based invite (token). Email is optional:
-- - if provided, the invite can only be accepted by that email (recommended).
-- - if omitted, any authenticated user can accept it via /join?token=...
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
  v_is_real_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  v_role := lower(trim(coalesce(p_member_role, 'cliente')));
  if v_role = 'empresa' then
    v_role := 'cliente';
  end if;
  if v_role not in ('admin', 'gestor', 'cliente', 'vendedor') then
    raise exception 'invalid member role';
  end if;

  -- Only admins can invite other admins.
  if v_role = 'admin' then
    select exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.member_role = 'admin'
    ) into v_is_real_admin;
    if not v_is_real_admin then
      raise exception 'only admins can invite admin role';
    end if;
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
      token = excluded.token,
      expires_at = excluded.expires_at,
      accepted_at = null,
      accepted_by = null,
      used_at = null
    returning id into v_invite_id;
  end if;

  if v_invite_id is null then
    select id into v_invite_id
    from public.company_invites
    where company_id = p_company_id
      and token = v_token
    limit 1;
  end if;

  return query select v_invite_id, v_token, v_expires;
end;
$$;

grant execute on function public.create_company_invite_link(uuid, text, int, text) to authenticated;

-- Validate token for the public /join page (no auth required).
create or replace function public.validate_company_invite(p_token text)
returns table (
  ok boolean,
  company_id uuid,
  company_name text,
  email text,
  member_role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.company_invites%rowtype;
  v_company_name text;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return query select false, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_inv
  from public.company_invites
  where token = trim(p_token)
  limit 1;

  if v_inv.id is null then
    return query select false, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_inv.accepted_at is not null or v_inv.used_at is not null then
    return query select false, v_inv.company_id, null::text, v_inv.email, v_inv.member_role, v_inv.expires_at;
    return;
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    return query select false, v_inv.company_id, null::text, v_inv.email, v_inv.member_role, v_inv.expires_at;
    return;
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = v_inv.company_id;

  return query
    select true, v_inv.company_id, v_company_name, v_inv.email, v_inv.member_role, v_inv.expires_at;
end;
$$;

grant execute on function public.validate_company_invite(text) to anon;
grant execute on function public.validate_company_invite(text) to authenticated;

-- Accept a token-based invite for the currently logged in user.
create or replace function public.accept_company_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_inv public.company_invites%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid invite token';
  end if;

  select * into v_inv
  from public.company_invites
  where token = trim(p_token)
  limit 1;

  if v_inv.id is null then
    raise exception 'invalid invite token';
  end if;

  if v_inv.accepted_at is not null or v_inv.used_at is not null then
    raise exception 'invite already used';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'invite expired';
  end if;

  -- If invite is email-scoped, enforce it.
  v_email := lower((auth.jwt() ->> 'email')::text);
  if v_inv.email is not null and v_inv.email <> '' then
    if v_email is null or v_email = '' then
      raise exception 'missing email';
    end if;
    if lower(v_inv.email) <> v_email then
      raise exception 'invite email mismatch';
    end if;
  end if;

  insert into public.company_members (company_id, user_id, member_role)
  values (v_inv.company_id, auth.uid(), v_inv.member_role)
  on conflict (company_id, user_id) do update
  set member_role = excluded.member_role;

  update public.company_invites
  set accepted_at = now(), accepted_by = auth.uid(), used_at = now()
  where id = v_inv.id;

  return v_inv.company_id;
end;
$$;

grant execute on function public.accept_company_invite(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Keep legacy email-invite RPC compatible (empresa -> cliente)
-- -----------------------------------------------------------------------------

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
  v_is_real_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_admin(p_company_id) then
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

  -- Only admins can invite other admins.
  if v_role = 'admin' then
    select exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.member_role = 'admin'
    ) into v_is_real_admin;
    if not v_is_real_admin then
      raise exception 'only admins can invite admin role';
    end if;
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
