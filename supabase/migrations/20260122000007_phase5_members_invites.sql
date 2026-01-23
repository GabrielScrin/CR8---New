-- Phase 5 (completion): Agency member management via invites + safe RPCs.
-- Goal:
-- - Allow agency admins/gestores to invite client users (empresa) and team members.
-- - Keep RLS on company_members minimal (users read their own memberships), using SECURITY DEFINER RPCs for management.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Invites
-- -----------------------------------------------------------------------------

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  member_role text not null default 'empresa' check (member_role in ('admin', 'gestor', 'empresa', 'vendedor')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.users (id) on delete set null
);

create unique index if not exists company_invites_company_email_uq
  on public.company_invites (company_id, lower(email));

create index if not exists company_invites_company_idx
  on public.company_invites (company_id, created_at desc);

alter table public.company_invites enable row level security;

drop policy if exists "Admins can read company invites" on public.company_invites;
create policy "Admins can read company invites"
on public.company_invites
for select
using (public.is_company_admin(company_id));

drop policy if exists "Admins can create company invites" on public.company_invites;
create policy "Admins can create company invites"
on public.company_invites
for insert
with check (public.is_company_admin(company_id));

drop policy if exists "Admins can revoke company invites" on public.company_invites;
create policy "Admins can revoke company invites"
on public.company_invites
for delete
using (public.is_company_admin(company_id));

-- -----------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER) - avoid relying on company_members RLS for management
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
    and public.is_company_admin(p_company_id)
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

create or replace function public.accept_company_invites_for_current_user()
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_email := lower((auth.jwt() ->> 'email')::text);
  if v_email is null or v_email = '' then
    return 0;
  end if;

  with pending as (
    select ci.id, ci.company_id, ci.member_role
    from public.company_invites ci
    where lower(ci.email) = v_email
      and ci.accepted_at is null
  )
  insert into public.company_members (company_id, user_id, member_role)
  select p.company_id, auth.uid(), p.member_role
  from pending p
  on conflict (company_id, user_id) do update
  set member_role = excluded.member_role;

  get diagnostics v_count = row_count;

  update public.company_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where lower(email) = v_email
    and accepted_at is null;

  return v_count;
end;
$$;

grant execute on function public.accept_company_invites_for_current_user() to authenticated;

create or replace function public.create_company_invite(
  p_company_id uuid,
  p_email text,
  p_member_role text default 'empresa'
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

  v_role := lower(trim(coalesce(p_member_role, 'empresa')));
  if v_role not in ('admin', 'gestor', 'empresa', 'vendedor') then
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

  insert into public.company_invites (company_id, email, member_role, created_by)
  values (p_company_id, v_email, v_role, auth.uid())
  on conflict (company_id, lower(email)) do update
  set
    member_role = excluded.member_role,
    created_by = excluded.created_by,
    created_at = now(),
    accepted_at = null,
    accepted_by = null
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
    set accepted_at = now(), accepted_by = v_user_id
    where id = v_invite_id;
  end if;

  return v_invite_id;
end;
$$;

grant execute on function public.create_company_invite(uuid, text, text) to authenticated;

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

  if not public.is_company_admin(v_company_id) then
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
  v_is_real_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  v_role := lower(trim(coalesce(p_member_role, 'empresa')));
  if v_role not in ('admin', 'gestor', 'empresa', 'vendedor') then
    raise exception 'invalid member role';
  end if;

  -- Only admins can grant admin role.
  if v_role = 'admin' then
    select exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.member_role = 'admin'
    ) into v_is_real_admin;
    if not v_is_real_admin then
      raise exception 'only admins can set admin role';
    end if;
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

  if not public.is_company_admin(p_company_id) then
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

-- -----------------------------------------------------------------------------
-- Auth trigger: ensure profile exists and accept pending invites for new users
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'UsuÃ¡rio'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url;

  if new.email is not null and trim(new.email) <> '' then
    insert into public.company_members (company_id, user_id, member_role)
    select
      ci.company_id,
      new.id,
      ci.member_role
    from public.company_invites ci
    where lower(ci.email) = lower(new.email)
      and ci.accepted_at is null
    on conflict (company_id, user_id) do update
    set member_role = excluded.member_role;

    update public.company_invites
    set accepted_at = now(), accepted_by = new.id
    where lower(email) = lower(new.email)
      and accepted_at is null;
  end if;

  return new;
end;
$$;

