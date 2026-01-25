-- Phase (SmartZap parity): WhatsApp Templates cache + sync support
-- Stores message templates per company (WABA) so UI can pick templates without calling Meta every time.

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  waba_id text,
  name text not null,
  language text not null default 'pt_BR',
  category text,
  status text,
  quality_score text,
  parameter_format text not null default 'positional' check (parameter_format in ('positional', 'named')),
  components jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_templates_company_name_lang_uq
  on public.whatsapp_templates (company_id, name, language);

create index if not exists whatsapp_templates_company_id_idx
  on public.whatsapp_templates (company_id);

create index if not exists whatsapp_templates_name_idx
  on public.whatsapp_templates (name);

drop trigger if exists set_whatsapp_templates_updated_at on public.whatsapp_templates;
create trigger set_whatsapp_templates_updated_at
before update on public.whatsapp_templates
for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;

drop policy if exists "Members can read whatsapp templates" on public.whatsapp_templates;
create policy "Members can read whatsapp templates"
on public.whatsapp_templates
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage whatsapp templates" on public.whatsapp_templates;
create policy "Admins can manage whatsapp templates"
on public.whatsapp_templates
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

