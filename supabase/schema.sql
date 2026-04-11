-- CR8 (Traffic OS) - Phase 1 schema (Supabase Postgres)
-- Apply this in Supabase SQL Editor (or via migrations if you use Supabase CLI).

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Compatibility / migration safety
-- -----------------------------------------------------------------------------
-- If you already created tables manually in a previous demo (ex: `leads` without
-- multi-tenant columns), these statements prevent policy creation from failing.

alter table if exists public.company_members add column if not exists company_id uuid;
alter table if exists public.campaigns add column if not exists company_id uuid;
alter table if exists public.chats add column if not exists company_id uuid;

alter table if exists public.leads add column if not exists company_id uuid;
alter table if exists public.leads add column if not exists campaign_id uuid;
alter table if exists public.leads add column if not exists assigned_to uuid;
alter table if exists public.leads add column if not exists utm_source text;
alter table if exists public.leads add column if not exists utm_campaign text;
alter table if exists public.leads add column if not exists external_id text;
alter table if exists public.leads add column if not exists value numeric;
alter table if exists public.leads add column if not exists last_interaction_at timestamptz;
alter table if exists public.leads add column if not exists raw jsonb;
alter table if exists public.leads add column if not exists created_at timestamptz;
alter table if exists public.leads add column if not exists updated_at timestamptz;

do $$
begin
  if to_regclass('public.leads') is not null then
    update public.leads
    set
      created_at = coalesce(created_at, now()),
      updated_at = coalesce(updated_at, now()),
      raw = coalesce(raw, '{}'::jsonb)
    where
      (created_at is null or updated_at is null or raw is null);
  end if;
end
$$;

alter table if exists public.leads alter column created_at set default now();
alter table if exists public.leads alter column updated_at set default now();
alter table if exists public.leads alter column raw set default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Users (profile table; auth users live in auth.users)
-- -----------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'gestor' check (role in ('admin', 'gestor', 'empresa', 'vendedor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuário'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for auth users created before this trigger existed
do $$
begin
  if to_regclass('public.users') is not null then
    insert into public.users (id, email, full_name, avatar_url)
    select
      au.id,
      au.email,
      coalesce(au.raw_user_meta_data->>'full_name', au.email, 'Usuário'),
      au.raw_user_meta_data->>'avatar_url'
    from auth.users au
    left join public.users pu on pu.id = au.id
    where pu.id is null;
  end if;
end
$$;

alter table public.users enable row level security;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users
for select
using (id = auth.uid());

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
using (id = auth.uid())
with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Companies (multi-tenancy root)
-- -----------------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users (id) on delete set null,
  -- Meta (Facebook/Instagram) identifiers + token cache para integracoes Graph client-side
  meta_ad_account_id text,
  meta_business_id text,
  meta_page_id text,
  meta_access_token text,
  meta_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create table if not exists public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  member_role text not null default 'gestor' check (member_role in ('admin', 'gestor', 'empresa', 'vendedor')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  -- Ensure the current user has a profile row (avoids FK violations on companies.created_by)
  insert into public.users (id, email, full_name, avatar_url)
  select
    au.id,
    au.email,
    coalesce(au.raw_user_meta_data->>'full_name', au.email, 'Usuário'),
    au.raw_user_meta_data->>'avatar_url'
  from auth.users au
  where au.id = auth.uid()
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url;

  insert into public.companies (name, created_by)
  values (p_name, auth.uid())
  returning id into new_company_id;

  insert into public.company_members (company_id, user_id, member_role)
  values (new_company_id, auth.uid(), 'admin');

  return new_company_id;
end;
$$;

grant execute on function public.create_company(text) to authenticated;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.member_role in ('admin', 'gestor')
  );
$$;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

drop policy if exists "Members can read companies" on public.companies;
create policy "Members can read companies"
on public.companies
for select
using (public.is_company_member(id));

drop policy if exists "Users can create companies" on public.companies;
create policy "Users can create companies"
on public.companies
for insert
with check (created_by = auth.uid());

drop policy if exists "Admins can update companies" on public.companies;
create policy "Admins can update companies"
on public.companies
for update
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

-- NOTE: Avoid recursive RLS on company_members (policies referencing helpers that
-- query company_members can cause the app to see no memberships).
drop policy if exists "Members can read company members" on public.company_members;
drop policy if exists "Admins can manage company members" on public.company_members;

create policy "Users can read own memberships"
on public.company_members
for select
using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Campaigns
-- -----------------------------------------------------------------------------

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  platform text not null default 'meta',
  meta_campaign_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;

drop policy if exists "Members can read campaigns" on public.campaigns;
create policy "Members can read campaigns"
on public.campaigns
for select
using (public.is_company_member(company_id));

drop policy if exists "Members can create campaigns" on public.campaigns;
create policy "Members can create campaigns"
on public.campaigns
for insert
with check (public.is_company_admin(company_id));

drop policy if exists "Members can update campaigns" on public.campaigns;
create policy "Members can update campaigns"
on public.campaigns
for update
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

-- -----------------------------------------------------------------------------
-- Leads
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('new', 'contacted', 'proposal', 'won', 'lost');
  end if;
end
$$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  assigned_to uuid references public.users (id) on delete set null,
  name text,
  email text,
  phone text,
  status public.lead_status not null default 'new',
  source text not null default 'Manual',
  utm_source text,
  utm_campaign text,
  external_id text,
  value numeric,
  last_interaction_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_company_id_idx on public.leads (company_id);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create unique index if not exists leads_company_external_id_uq on public.leads (company_id, external_id) where external_id is not null;

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

drop policy if exists "Members can read leads" on public.leads;
create policy "Members can read leads"
on public.leads
for select
using (public.is_company_member(company_id));

drop policy if exists "Members can create leads" on public.leads;
create policy "Members can create leads"
on public.leads
for insert
with check (public.is_company_member(company_id));

drop policy if exists "Members can update leads" on public.leads;
create policy "Members can update leads"
on public.leads
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

-- -----------------------------------------------------------------------------
-- Chats (sessions + messages)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_platform') then
    create type public.chat_platform as enum ('whatsapp', 'instagram', 'web', 'meta');
  end if;
  if not exists (select 1 from pg_type where typname = 'chat_sender') then
    create type public.chat_sender as enum ('user', 'agent', 'system');
  end if;
end
$$;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  platform public.chat_platform not null,
  external_thread_id text,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_chats_updated_at on public.chats;
create trigger set_chats_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender public.chat_sender not null,
  content text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Members can read chats" on public.chats;
create policy "Members can read chats"
on public.chats
for select
using (public.is_company_member(company_id));

drop policy if exists "Members can create chats" on public.chats;
create policy "Members can create chats"
on public.chats
for insert
with check (public.is_company_member(company_id));

drop policy if exists "Members can update chats" on public.chats;
create policy "Members can update chats"
on public.chats
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists "Members can read chat messages" on public.chat_messages;
create policy "Members can read chat messages"
on public.chat_messages
for select
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and public.is_company_member(c.company_id)
  )
);

drop policy if exists "Members can create chat messages" on public.chat_messages;
create policy "Members can create chat messages"
on public.chat_messages
for insert
with check (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and public.is_company_member(c.company_id)
  )
);

-- -----------------------------------------------------------------------------
-- Traffic view presets (per-user column presets for Traffic Analytics)
-- -----------------------------------------------------------------------------

create table if not exists public.traffic_view_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  name text not null,
  optional_columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists traffic_view_presets_user_level_idx on public.traffic_view_presets (user_id, level);

drop trigger if exists set_traffic_view_presets_updated_at on public.traffic_view_presets;
create trigger set_traffic_view_presets_updated_at
before update on public.traffic_view_presets
for each row execute function public.set_updated_at();

alter table public.traffic_view_presets enable row level security;

drop policy if exists "Users can read own traffic view presets" on public.traffic_view_presets;
create policy "Users can read own traffic view presets"
on public.traffic_view_presets
for select
using (user_id = auth.uid());

drop policy if exists "Users can create own traffic view presets" on public.traffic_view_presets;
create policy "Users can create own traffic view presets"
on public.traffic_view_presets
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update own traffic view presets" on public.traffic_view_presets;
create policy "Users can update own traffic view presets"
on public.traffic_view_presets
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own traffic view presets" on public.traffic_view_presets;
create policy "Users can delete own traffic view presets"
on public.traffic_view_presets
for delete
using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Phase 2: CRM Operacional (Roleta + criação manual de leads)
-- -----------------------------------------------------------------------------

-- Retorna o usuário (vendedor) com menos leads atribuídos na empresa.
-- Fallback: se não houver vendedor, usa um admin/gestor.
create or replace function public.get_salesperson_with_fewest_leads(p_company_id uuid)
returns uuid
language sql
stable
as $$
  with sellers as (
    select cm.user_id
    from public.company_members as cm
    where cm.company_id = p_company_id
      and cm.member_role = 'vendedor'
  ),
  seller_choice as (
    select s.user_id
    from sellers s
    left join public.company_members cm on cm.user_id = s.user_id and cm.company_id = p_company_id
    left join public.leads l on l.assigned_to = s.user_id and l.company_id = p_company_id
    group by s.user_id
    order by count(l.id) asc, random()
    limit 1
  ),
  fallback_choice as (
    select cm.user_id
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.member_role in ('admin', 'gestor')
    order by cm.created_at asc
    limit 1
  )
  select coalesce((select user_id from seller_choice), (select user_id from fallback_choice));
$$;

grant execute on function public.get_salesperson_with_fewest_leads(uuid) to authenticated, service_role;

-- Cria lead manualmente e aplica roleta (para UI).
create or replace function public.create_lead_manual(
  p_company_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_value numeric default null,
  p_source text default 'Manual',
  p_raw jsonb default null
)
returns setof public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned_to_user_id uuid;
  v_new_lead_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_member(p_company_id) then
    raise exception 'not a company member';
  end if;

  v_assigned_to_user_id := public.get_salesperson_with_fewest_leads(p_company_id);

  insert into public.leads (company_id, name, email, phone, value, source, assigned_to, status, raw, last_interaction_at)
  values (
    p_company_id,
    p_name,
    p_email,
    p_phone,
    p_value,
    p_source,
    v_assigned_to_user_id,
    'new',
    coalesce(p_raw, '{}'::jsonb),
    now()
  )
  returning id into v_new_lead_id;

  return query select * from public.leads where id = v_new_lead_id;
end;
$$;

grant execute on function public.create_lead_manual(uuid, text, text, text, numeric, text, jsonb) to authenticated;

-- Trigger: aplica roleta automaticamente se o lead entrar sem assigned_to.
create or replace function public.assign_lead_if_missing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.assigned_to is null then
    new.assigned_to := public.get_salesperson_with_fewest_leads(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_lead_if_missing on public.leads;
create trigger assign_lead_if_missing
before insert on public.leads
for each row execute function public.assign_lead_if_missing();

-- -----------------------------------------------------------------------------
-- Phase 3: Omnichannel / Live Chat real (sessão + leitura)
-- -----------------------------------------------------------------------------

alter table if exists public.chats
  add column if not exists ai_active boolean not null default true,
  add column if not exists taken_by uuid references public.users (id) on delete set null,
  add column if not exists taken_at timestamptz,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists raw jsonb not null default '{}'::jsonb;

create index if not exists chats_company_last_message_at_idx on public.chats (company_id, last_message_at desc);

drop index if exists public.chats_company_external_thread_uq;
create unique index if not exists chats_company_platform_external_thread_uq
  on public.chats (company_id, platform, external_thread_id)
  where external_thread_id is not null;

create table if not exists public.chat_reads (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_reads_user_idx on public.chat_reads (user_id);

alter table public.chat_reads enable row level security;

drop policy if exists "Users can read own chat reads" on public.chat_reads;
create policy "Users can read own chat reads"
on public.chat_reads
for select
using (user_id = auth.uid());

drop policy if exists "Users can upsert own chat reads" on public.chat_reads;
create policy "Users can upsert own chat reads"
on public.chat_reads
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update own chat reads" on public.chat_reads;
create policy "Users can update own chat reads"
on public.chat_reads
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
