-- Phase 5 (extension): Agency finance basics
-- Stores media balance and agency fee per company.

alter table if exists public.companies
  add column if not exists currency text not null default 'BRL',
  add column if not exists media_balance numeric,
  add column if not exists agency_fee_percent numeric,
  add column if not exists agency_fee_fixed numeric;

create index if not exists companies_currency_idx on public.companies (currency);

