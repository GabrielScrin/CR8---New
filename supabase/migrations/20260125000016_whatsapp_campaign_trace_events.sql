-- WhatsApp (SmartZap-style): trace events for campaign runs
-- Keeps an audit trail for dispatch/precheck/debugging.

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_campaign_trace_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  campaign_id uuid not null references public.whatsapp_campaigns (id) on delete cascade,
  recipient_id uuid references public.whatsapp_campaign_recipients (id) on delete set null,
  chat_id uuid references public.chats (id) on delete set null,
  step text not null,
  ok boolean not null default true,
  http_status integer,
  message text,
  raw jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_campaign_trace_events_campaign_idx
  on public.whatsapp_campaign_trace_events (campaign_id, created_at desc);
create index if not exists whatsapp_campaign_trace_events_company_idx
  on public.whatsapp_campaign_trace_events (company_id, created_at desc);
create index if not exists whatsapp_campaign_trace_events_recipient_idx
  on public.whatsapp_campaign_trace_events (recipient_id, created_at desc)
  where recipient_id is not null;

alter table public.whatsapp_campaign_trace_events enable row level security;

drop policy if exists "Members can read whatsapp campaign trace events" on public.whatsapp_campaign_trace_events;
create policy "Members can read whatsapp campaign trace events"
on public.whatsapp_campaign_trace_events
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage whatsapp campaign trace events" on public.whatsapp_campaign_trace_events;
create policy "Admins can manage whatsapp campaign trace events"
on public.whatsapp_campaign_trace_events
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

