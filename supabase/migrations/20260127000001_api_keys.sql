-- Migration: create api_keys table and helper to create API tokens
-- Ensure pgcrypto extension is available for digest/gen_random_bytes
create extension if not exists pgcrypto;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  key_prefix text not null,
  key_hash bytea not null,
  name text,
  status text not null default 'active',
  last_used_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- create function to generate token, store only hash and prefix, and return token
create or replace function public.create_api_key(p_company_id uuid, p_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  token text;
  prefix text;
  hash bytea;
begin
  -- token: 48 hex chars (~24 bytes) -> length 48
  token := encode(gen_random_bytes(24), 'hex');
  prefix := left(token, 8);
  hash := digest(token, 'sha256'::text);

  insert into public.api_keys (company_id, key_prefix, key_hash, name, created_by)
  values (p_company_id, prefix, hash, p_name, auth.uid())
  returning id into token; -- reuse variable

  return token; -- returns the plain token to caller (only at creation)
end;
$$;

-- validate token RPC: returns api_keys row if token matches hash
create or replace function public.validate_api_key(p_token text)
returns table(id uuid, company_id uuid, key_prefix text, status text)
language sql security definer set search_path = public
as $$
  select id, company_id, key_prefix, status
  from public.api_keys
  where key_hash = digest(p_token, 'sha256'::text)
  limit 1;
$$;

-- Enable RLS on api_keys
alter table public.api_keys enable row level security;

drop policy if exists "Admins can manage api_keys" on public.api_keys;
create policy "Admins can manage api_keys"
  on public.api_keys
  for all
  using (exists (
    select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin')
  ))
  with check (exists (
    select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin')
  ));

-- Allow read-only for managers (gestor) to list keys (if desired, comment out to restrict to admin only)
create policy "Managers can read api_keys"
  on public.api_keys
  for select
  using (exists (
    select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin','gestor')
  ));

-- Note: tokens are returned only by the function at creation and never stored in plain text.
