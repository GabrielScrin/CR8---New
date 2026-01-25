-- Phase: Contacts (Leads as Contacts) - Attribution, Timeline, and Conversion Outbox

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Leads: attribution + score
-- -----------------------------------------------------------------------------

alter table if exists public.leads add column if not exists utm_medium text;
alter table if exists public.leads add column if not exists utm_content text;
alter table if exists public.leads add column if not exists utm_term text;
alter table if exists public.leads add column if not exists landing_page_url text;
alter table if exists public.leads add column if not exists referrer_url text;

alter table if exists public.leads add column if not exists gclid text;
alter table if exists public.leads add column if not exists gbraid text;
alter table if exists public.leads add column if not exists wbraid text;

alter table if exists public.leads add column if not exists fbclid text;
alter table if exists public.leads add column if not exists fbc text;
alter table if exists public.leads add column if not exists fbp text;

alter table if exists public.leads add column if not exists first_touch_at timestamptz;
alter table if exists public.leads add column if not exists first_touch_channel text;
alter table if exists public.leads add column if not exists last_touch_at timestamptz;
alter table if exists public.leads add column if not exists last_touch_channel text;

alter table if exists public.leads add column if not exists lead_score_total int;
alter table if exists public.leads add column if not exists lead_score_last int;
alter table if exists public.leads add column if not exists lead_score_updated_at timestamptz;

-- -----------------------------------------------------------------------------
-- Companies: Ads config (non-secret ids)
-- -----------------------------------------------------------------------------

alter table if exists public.companies add column if not exists google_ads_customer_id text;
alter table if exists public.companies add column if not exists google_ads_login_customer_id text;
alter table if exists public.companies add column if not exists google_ads_conversion_action_lead text;
alter table if exists public.companies add column if not exists google_ads_conversion_action_purchase text;
alter table if exists public.companies add column if not exists google_ads_currency_code text;

alter table if exists public.companies add column if not exists meta_pixel_id text;

-- -----------------------------------------------------------------------------
-- Lead Events (timeline)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_event_type') then
    create type public.lead_event_type as enum (
      'lead_created',
      'inbound_message',
      'outbound_message',
      'form_submission',
      'pipeline_stage_change',
      'note',
      'ad_event_sent',
      'ad_event_failed'
    );
  end if;
end
$$;

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  type public.lead_event_type not null,
  channel text not null default 'system',
  summary text,
  raw jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_events_company_id_idx on public.lead_events (company_id);
create index if not exists lead_events_lead_id_occurred_at_idx on public.lead_events (lead_id, occurred_at desc);

drop trigger if exists set_lead_events_updated_at on public.lead_events;
create trigger set_lead_events_updated_at
before update on public.lead_events
for each row execute function public.set_updated_at();

alter table public.lead_events enable row level security;

drop policy if exists "Members can read lead events" on public.lead_events;
create policy "Members can read lead events"
on public.lead_events
for select
using (public.is_company_member(company_id) or auth.role() = 'service_role');

drop policy if exists "Members can create lead events" on public.lead_events;
create policy "Members can create lead events"
on public.lead_events
for insert
with check (public.is_company_member(company_id) or auth.role() = 'service_role');

drop policy if exists "Admins can update lead events" on public.lead_events;
create policy "Admins can update lead events"
on public.lead_events
for update
using (public.is_company_admin(company_id) or auth.role() = 'service_role')
with check (public.is_company_admin(company_id) or auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Conversion events outbox
-- -----------------------------------------------------------------------------

create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  provider text not null check (provider in ('google_ads', 'meta')),
  event_key text not null,
  dedupe_key text,
  event_time timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversion_events_status_idx on public.conversion_events (status, created_at asc);
create index if not exists conversion_events_company_id_idx on public.conversion_events (company_id);
create unique index if not exists conversion_events_company_provider_dedupe_uq
  on public.conversion_events (company_id, provider, dedupe_key)
  where dedupe_key is not null;

drop trigger if exists set_conversion_events_updated_at on public.conversion_events;
create trigger set_conversion_events_updated_at
before update on public.conversion_events
for each row execute function public.set_updated_at();

alter table public.conversion_events enable row level security;

drop policy if exists "Members can read conversion events" on public.conversion_events;
create policy "Members can read conversion events"
on public.conversion_events
for select
using (public.is_company_member(company_id) or auth.role() = 'service_role');

drop policy if exists "Admins can manage conversion events" on public.conversion_events;
create policy "Admins can manage conversion events"
on public.conversion_events
for all
using (public.is_company_admin(company_id) or auth.role() = 'service_role')
with check (public.is_company_admin(company_id) or auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.detect_touch_channel(p_source text, p_default text)
returns text
language sql
stable
as $$
  select
    case
      when p_source ilike '%whatsapp%' then 'whatsapp'
      when p_source ilike '%instagram%' then 'instagram'
      when p_source ilike '%quiz%' then 'form'
      when p_source ilike '%landing%' then 'web'
      else coalesce(nullif(p_default, ''), 'system')
    end;
$$;

create or replace function public.queue_conversion_event(
  p_company_id uuid,
  p_lead_id uuid,
  p_provider text,
  p_event_key text,
  p_dedupe_key text,
  p_event_time timestamptz,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.conversion_events (
    company_id, lead_id, provider, event_key, dedupe_key, event_time, payload, status
  )
  values (
    p_company_id, p_lead_id, p_provider, p_event_key, p_dedupe_key, coalesce(p_event_time, now()), coalesce(p_payload, '{}'::jsonb), 'pending'
  )
  on conflict (company_id, provider, dedupe_key)
  do update set
    event_time = excluded.event_time,
    payload = excluded.payload,
    status = case when public.conversion_events.status = 'sent' then 'sent' else 'pending' end
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.queue_conversion_event(uuid, uuid, text, text, text, timestamptz, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers: lead_created + pipeline stage changes
-- -----------------------------------------------------------------------------

create or replace function public.lead_before_insert_touch_defaults()
returns trigger
language plpgsql
as $$
declare
  v_channel text;
  v_now timestamptz;
begin
  v_now := coalesce(new.last_interaction_at, new.created_at, now());
  v_channel := public.detect_touch_channel(coalesce(new.source, ''), coalesce(new.last_touch_channel, ''));

  if new.first_touch_at is null then
    new.first_touch_at := v_now;
  end if;
  if new.first_touch_channel is null then
    new.first_touch_channel := v_channel;
  end if;
  if new.last_touch_at is null then
    new.last_touch_at := v_now;
  end if;
  if new.last_touch_channel is null then
    new.last_touch_channel := v_channel;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_before_insert_touch_defaults on public.leads;
create trigger lead_before_insert_touch_defaults
before insert on public.leads
for each row execute function public.lead_before_insert_touch_defaults();

create or replace function public.lead_after_insert_events()
returns trigger
language plpgsql
as $$
begin
  insert into public.lead_events (company_id, lead_id, type, channel, summary, raw, occurred_at)
  values (
    new.company_id,
    new.id,
    'lead_created',
    coalesce(new.first_touch_channel, 'system'),
    'Lead criado',
    jsonb_build_object(
      'source', new.source,
      'utm_source', new.utm_source,
      'utm_campaign', new.utm_campaign
    ),
    coalesce(new.first_touch_at, new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists lead_after_insert_events on public.leads;
create trigger lead_after_insert_events
after insert on public.leads
for each row execute function public.lead_after_insert_events();

create or replace function public.lead_after_update_events()
returns trigger
language plpgsql
as $$
begin
  -- Status change -> timeline
  if old.status is distinct from new.status then
    insert into public.lead_events (company_id, lead_id, type, channel, summary, raw, occurred_at)
    values (
      new.company_id,
      new.id,
      'pipeline_stage_change',
      'crm',
      'Mudança no pipeline',
      jsonb_build_object('from', old.status, 'to', new.status),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists lead_after_update_events on public.leads;
create trigger lead_after_update_events
after update on public.leads
for each row execute function public.lead_after_update_events();

create or replace function public.lead_before_update_touch_defaults()
returns trigger
language plpgsql
as $$
declare
  v_now timestamptz;
  v_channel text;
begin
  -- Update touch whenever we have a new interaction, or when status changes.
  if (old.last_interaction_at is distinct from new.last_interaction_at) or (old.status is distinct from new.status) then
    v_now := coalesce(new.last_interaction_at, now());
    v_channel :=
      case
        when old.status is distinct from new.status then 'crm'
        else public.detect_touch_channel(coalesce(new.source, ''), coalesce(new.last_touch_channel, ''))
      end;

    new.last_touch_at := v_now;
    new.last_touch_channel := v_channel;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_before_update_touch_defaults on public.leads;
create trigger lead_before_update_touch_defaults
before update on public.leads
for each row execute function public.lead_before_update_touch_defaults();
