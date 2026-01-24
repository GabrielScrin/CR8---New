-- Phase 5 (completion): Finance ledger (media balance + fee tracking)
-- Goal:
-- - Provide an auditable transaction history (credits/debits/fees/adjustments)
-- - Keep multi-tenancy via company_id and existing RLS helpers

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'finance_txn_kind') then
    create type public.finance_txn_kind as enum ('media_credit', 'media_spend', 'agency_fee', 'adjustment');
  end if;
end
$$;

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.finance_txn_kind not null,
  -- Signed amount: +credit / -spend / +fee / +/-adjustment
  amount numeric not null,
  currency text not null default 'BRL',
  note text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists finance_transactions_company_created_at_idx
  on public.finance_transactions (company_id, created_at desc);

alter table public.finance_transactions enable row level security;

drop policy if exists "Members can read finance transactions" on public.finance_transactions;
create policy "Members can read finance transactions"
on public.finance_transactions
for select
using (public.is_company_member(company_id));

-- Write operations are performed via SECURITY DEFINER RPC to keep RLS simple.

create or replace function public.apply_finance_transaction(
  p_company_id uuid,
  p_kind text,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_kind public.finance_txn_kind;
  v_currency text;
  v_id uuid;
  v_affects_balance boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'not authorized';
  end if;

  v_kind := lower(trim(coalesce(p_kind, '')))::public.finance_txn_kind;

  if p_amount is null or p_amount = 0 then
    raise exception 'invalid amount';
  end if;

  select coalesce(currency, 'BRL') into v_currency
  from public.companies
  where id = p_company_id;

  if v_currency is null or v_currency = '' then
    v_currency := 'BRL';
  end if;

  insert into public.finance_transactions (company_id, kind, amount, currency, note, created_by)
  values (p_company_id, v_kind, p_amount, v_currency, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  v_affects_balance := v_kind in ('media_credit', 'media_spend', 'adjustment');
  if v_affects_balance then
    update public.companies
    set
      media_balance = coalesce(media_balance, 0) + p_amount,
      updated_at = now()
    where id = p_company_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.apply_finance_transaction(uuid, text, numeric, text) to authenticated;

