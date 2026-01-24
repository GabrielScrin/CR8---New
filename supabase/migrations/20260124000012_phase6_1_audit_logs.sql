-- Phase 6.1 (Go-Live): Audit logs (operational readiness)
-- Goal:
-- - Create an auditable trail of key actions (memberships, invites, finance)
-- - Keep multi-tenancy via company_id and existing RLS helpers

create extension if not exists pgcrypto;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id text,
  actor_user_id uuid references public.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_company_created_at_idx
  on public.audit_events (company_id, created_at desc);

create index if not exists audit_events_company_action_idx
  on public.audit_events (company_id, action);

alter table public.audit_events enable row level security;

drop policy if exists "Members can read audit events" on public.audit_events;
create policy "Members can read audit events"
on public.audit_events
for select
using (public.is_company_member(company_id));

-- Writes are done via SECURITY DEFINER helper (used by triggers / RPCs).
create or replace function public.audit_log(
  p_company_id uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action text;
begin
  v_action := trim(coalesce(p_action, ''));
  if v_action = '' then
    return;
  end if;

  insert into public.audit_events (company_id, action, entity_type, entity_id, actor_user_id, metadata)
  values (
    p_company_id,
    v_action,
    nullif(trim(coalesce(p_entity_type, '')), ''),
    nullif(trim(coalesce(p_entity_id, '')), ''),
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.audit_log(uuid, text, text, text, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers: finance_transactions
-- -----------------------------------------------------------------------------

create or replace function public.audit_finance_transactions_ai()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.audit_log(
    new.company_id,
    'finance_transaction.created',
    'finance_transaction',
    new.id::text,
    new.created_by,
    jsonb_build_object(
      'kind', new.kind,
      'amount', new.amount,
      'currency', new.currency,
      'note', new.note
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_finance_transactions_ai on public.finance_transactions;
create trigger audit_finance_transactions_ai
after insert on public.finance_transactions
for each row execute function public.audit_finance_transactions_ai();

-- -----------------------------------------------------------------------------
-- Triggers: company_invites
-- -----------------------------------------------------------------------------

create or replace function public.audit_company_invites_ai()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.audit_log(
    new.company_id,
    'company_invite.created',
    'company_invite',
    new.id::text,
    new.created_by,
    jsonb_build_object('email', new.email, 'role', new.member_role)
  );
  return new;
end;
$$;

create or replace function public.audit_company_invites_au()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.accepted_at is null and new.accepted_at is not null then
    perform public.audit_log(
      new.company_id,
      'company_invite.accepted',
      'company_invite',
      new.id::text,
      coalesce(new.accepted_by, auth.uid()),
      jsonb_build_object('email', new.email, 'role', new.member_role)
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_company_invites_ad()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.audit_log(
    old.company_id,
    'company_invite.revoked',
    'company_invite',
    old.id::text,
    auth.uid(),
    jsonb_build_object('email', old.email, 'role', old.member_role, 'accepted_at', old.accepted_at)
  );
  return old;
end;
$$;

drop trigger if exists audit_company_invites_ai on public.company_invites;
create trigger audit_company_invites_ai
after insert on public.company_invites
for each row execute function public.audit_company_invites_ai();

drop trigger if exists audit_company_invites_au on public.company_invites;
create trigger audit_company_invites_au
after update on public.company_invites
for each row execute function public.audit_company_invites_au();

drop trigger if exists audit_company_invites_ad on public.company_invites;
create trigger audit_company_invites_ad
after delete on public.company_invites
for each row execute function public.audit_company_invites_ad();

-- -----------------------------------------------------------------------------
-- Triggers: company_members (membership changes)
-- -----------------------------------------------------------------------------

create or replace function public.audit_company_members_ai()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.audit_log(
    new.company_id,
    'company_member.added',
    'company_member',
    (new.company_id::text || ':' || new.user_id::text),
    auth.uid(),
    jsonb_build_object('user_id', new.user_id, 'role', new.member_role)
  );
  return new;
end;
$$;

create or replace function public.audit_company_members_au()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(old.member_role, '') <> coalesce(new.member_role, '') then
    perform public.audit_log(
      new.company_id,
      'company_member.role_changed',
      'company_member',
      (new.company_id::text || ':' || new.user_id::text),
      auth.uid(),
      jsonb_build_object('user_id', new.user_id, 'from', old.member_role, 'to', new.member_role)
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_company_members_ad()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.audit_log(
    old.company_id,
    'company_member.removed',
    'company_member',
    (old.company_id::text || ':' || old.user_id::text),
    auth.uid(),
    jsonb_build_object('user_id', old.user_id, 'role', old.member_role)
  );
  return old;
end;
$$;

drop trigger if exists audit_company_members_ai on public.company_members;
create trigger audit_company_members_ai
after insert on public.company_members
for each row execute function public.audit_company_members_ai();

drop trigger if exists audit_company_members_au on public.company_members;
create trigger audit_company_members_au
after update on public.company_members
for each row execute function public.audit_company_members_au();

drop trigger if exists audit_company_members_ad on public.company_members;
create trigger audit_company_members_ad
after delete on public.company_members
for each row execute function public.audit_company_members_ad();

