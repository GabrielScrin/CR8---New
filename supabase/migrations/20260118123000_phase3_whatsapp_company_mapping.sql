-- Phase 3 (patch): map WhatsApp webhooks to a company by phone_number_id
-- This avoids relying on a single global WHATSAPP_COMPANY_ID.

alter table if exists public.companies
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_waba_id text;

create index if not exists companies_whatsapp_phone_number_id_idx
  on public.companies (whatsapp_phone_number_id);

