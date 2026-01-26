-- Migration: webhooks inbound/outbound tables, events and RPC helpers
-- Ensure pgcrypto extension is available for digest/gen_random_bytes
create extension if not exists pgcrypto;

create table if not exists public.integration_inbound_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  entry_board_id uuid null,
  entry_stage_id uuid null,
  secret_prefix text not null,
  secret_hash bytea not null,
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events_in (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.integration_inbound_sources (id) on delete cascade,
  external_event_id text null,
  payload jsonb not null,
  status text not null default 'received', -- received/processed/error
  response jsonb null,
  created_at timestamptz not null default now()
);

create unique index if not exists webhook_in_dedupe_idx on public.webhook_events_in (source_id, external_event_id) where external_event_id is not null;

create table if not exists public.integration_outbound_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text,
  url text not null,
  secret_prefix text,
  secret_hash bytea,
  events text[] not null default array[]::text[],
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events_out (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.integration_outbound_endpoints (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_out_id uuid not null references public.webhook_events_out (id) on delete cascade,
  attempt integer not null default 1,
  status text not null,
  response_status integer,
  response_body text,
  error text,
  created_at timestamptz not null default now()
);

-- RPC: create_inbound_source returns plain secret (only at creation)
create or replace function public.create_inbound_source(p_company_id uuid, p_name text, p_entry_board_id uuid, p_entry_stage_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  token text;
  prefix text;
  hash bytea;
begin
  token := encode(gen_random_bytes(24), 'hex');
  prefix := left(token, 8);
  hash := digest(token, 'sha256'::text);

  insert into public.integration_inbound_sources (company_id, name, entry_board_id, entry_stage_id, secret_prefix, secret_hash, created_by)
  values (p_company_id, p_name, p_entry_board_id, p_entry_stage_id, prefix, hash, auth.uid());

  return token;
end;
$$;

-- RPC: validate_inbound_secret -> returns source row if token matches
create or replace function public.validate_inbound_secret(p_source_id uuid, p_token text)
returns table(id uuid, company_id uuid, name text, entry_board_id uuid, entry_stage_id uuid, active boolean)
language sql security definer set search_path = public
as $$
  select id, company_id, name, entry_board_id, entry_stage_id, active
  from public.integration_inbound_sources
  where id = p_source_id and secret_hash = digest(p_token, 'sha256'::text)
  limit 1;
$$;

-- RLS: allow company admins/managers to manage/list inbound/outbound sources
alter table public.integration_inbound_sources enable row level security;
create policy "Admins can manage inbound sources"
  on public.integration_inbound_sources
  for all
  using (exists (select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin')))
  with check (exists (select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin')));

create policy "Managers can read inbound sources"
  on public.integration_inbound_sources
  for select
  using (exists (select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin','gestor')));

alter table public.integration_outbound_endpoints enable row level security;
create policy "Admins can manage outbound endpoints"
  on public.integration_outbound_endpoints
  for all
  using (exists (select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin')))
  with check (exists (select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin')));

create policy "Managers can read outbound endpoints"
  on public.integration_outbound_endpoints
  for select
  using (exists (select 1 from public.company_members m where m.company_id = company_id and m.user_id = auth.uid() and m.member_role in ('admin','gestor')));

-- Events tables open for insert by functions (service role) only; normal users can read events for their company via joins if needed.
alter table public.webhook_events_in enable row level security;
create policy "Service role can insert webhook events in" on public.webhook_events_in for insert using (false) with check (false);
create policy "Admins can read webhook events in" on public.webhook_events_in for select using (exists (select 1 from public.integration_inbound_sources s join public.company_members m on m.company_id = s.company_id where s.id = source_id and m.user_id = auth.uid() and m.member_role in ('admin','gestor')));

alter table public.webhook_events_out enable row level security;
alter table public.webhook_deliveries enable row level security;

-- Note: service role must be used by Edge Functions to insert events and deliveries.
