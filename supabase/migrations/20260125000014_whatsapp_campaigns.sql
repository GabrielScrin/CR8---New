-- Phase WhatsApp (SmartZap-style): bulk campaigns + recipients + opt-out
-- Uses existing multi-tenant helpers: public.is_company_member / public.is_company_admin

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'whatsapp_campaign_status') then
    create type public.whatsapp_campaign_status as enum ('draft', 'scheduled', 'sending', 'paused', 'completed', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'whatsapp_campaign_message_kind') then
    create type public.whatsapp_campaign_message_kind as enum ('text', 'template');
  end if;

  if not exists (select 1 from pg_type where typname = 'whatsapp_campaign_recipient_status') then
    create type public.whatsapp_campaign_recipient_status as enum ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Campaigns
-- -----------------------------------------------------------------------------

create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  status public.whatsapp_campaign_status not null default 'draft',
  message_kind public.whatsapp_campaign_message_kind not null default 'text',
  -- text
  text_body text,
  -- template (WhatsApp Cloud API)
  template_name text,
  template_language text,
  template_components jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  total_recipients integer not null default 0,
  sent integer not null default 0,
  delivered integer not null default 0,
  read integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_campaigns_company_id_idx on public.whatsapp_campaigns (company_id);
create index if not exists whatsapp_campaigns_company_status_idx on public.whatsapp_campaigns (company_id, status);
create index if not exists whatsapp_campaigns_created_at_idx on public.whatsapp_campaigns (created_at desc);

drop trigger if exists set_whatsapp_campaigns_updated_at on public.whatsapp_campaigns;
create trigger set_whatsapp_campaigns_updated_at
before update on public.whatsapp_campaigns
for each row execute function public.set_updated_at();

alter table public.whatsapp_campaigns enable row level security;

drop policy if exists "Members can read whatsapp campaigns" on public.whatsapp_campaigns;
create policy "Members can read whatsapp campaigns"
on public.whatsapp_campaigns
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage whatsapp campaigns" on public.whatsapp_campaigns;
create policy "Admins can manage whatsapp campaigns"
on public.whatsapp_campaigns
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

-- -----------------------------------------------------------------------------
-- Opt-out / suppressions (do not message these phones)
-- -----------------------------------------------------------------------------

create table if not exists public.whatsapp_phone_suppressions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  phone text not null,
  reason text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_phone_suppressions_company_phone_uq
  on public.whatsapp_phone_suppressions (company_id, phone);

drop trigger if exists set_whatsapp_phone_suppressions_updated_at on public.whatsapp_phone_suppressions;
create trigger set_whatsapp_phone_suppressions_updated_at
before update on public.whatsapp_phone_suppressions
for each row execute function public.set_updated_at();

alter table public.whatsapp_phone_suppressions enable row level security;

drop policy if exists "Members can read whatsapp phone suppressions" on public.whatsapp_phone_suppressions;
create policy "Members can read whatsapp phone suppressions"
on public.whatsapp_phone_suppressions
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage whatsapp phone suppressions" on public.whatsapp_phone_suppressions;
create policy "Admins can manage whatsapp phone suppressions"
on public.whatsapp_phone_suppressions
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

-- -----------------------------------------------------------------------------
-- Campaign recipients
-- -----------------------------------------------------------------------------

create table if not exists public.whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  chat_id uuid references public.chats (id) on delete set null,
  phone text not null,
  name text,
  status public.whatsapp_campaign_recipient_status not null default 'pending',
  external_message_id text,
  error text,
  sending_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  skipped_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_campaign_recipients_campaign_status_idx
  on public.whatsapp_campaign_recipients (campaign_id, status, created_at);
create unique index if not exists whatsapp_campaign_recipients_campaign_phone_uq
  on public.whatsapp_campaign_recipients (campaign_id, phone);
create index if not exists whatsapp_campaign_recipients_external_msg_idx
  on public.whatsapp_campaign_recipients (external_message_id)
  where external_message_id is not null;

drop trigger if exists set_whatsapp_campaign_recipients_updated_at on public.whatsapp_campaign_recipients;
create trigger set_whatsapp_campaign_recipients_updated_at
before update on public.whatsapp_campaign_recipients
for each row execute function public.set_updated_at();

create or replace function public.update_whatsapp_campaign_aggregates()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    update public.whatsapp_campaigns
      set total_recipients = total_recipients + 1
      where id = new.campaign_id;

    return new;
  end if;

  -- Only count first transitions for each timestamp field (monotonic).
  if (new.sent_at is not null) and (old.sent_at is null) then
    update public.whatsapp_campaigns
      set sent = sent + 1
      where id = new.campaign_id;
  end if;

  if (new.delivered_at is not null) and (old.delivered_at is null) then
    update public.whatsapp_campaigns
      set delivered = delivered + 1
      where id = new.campaign_id;
  end if;

  if (new.read_at is not null) and (old.read_at is null) then
    update public.whatsapp_campaigns
      set read = read + 1
      where id = new.campaign_id;
  end if;

  if (new.failed_at is not null) and (old.failed_at is null) then
    update public.whatsapp_campaigns
      set failed = failed + 1
      where id = new.campaign_id;
  end if;

  if (new.skipped_at is not null) and (old.skipped_at is null) then
    update public.whatsapp_campaigns
      set skipped = skipped + 1
      where id = new.campaign_id;
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_campaign_recipients_aggregates on public.whatsapp_campaign_recipients;
create trigger whatsapp_campaign_recipients_aggregates
after insert or update on public.whatsapp_campaign_recipients
for each row execute function public.update_whatsapp_campaign_aggregates();

alter table public.whatsapp_campaign_recipients enable row level security;

drop policy if exists "Members can read whatsapp campaign recipients" on public.whatsapp_campaign_recipients;
create policy "Members can read whatsapp campaign recipients"
on public.whatsapp_campaign_recipients
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage whatsapp campaign recipients" on public.whatsapp_campaign_recipients;
create policy "Admins can manage whatsapp campaign recipients"
on public.whatsapp_campaign_recipients
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

