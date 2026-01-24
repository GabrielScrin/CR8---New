-- Phase 4: Creative analysis (Vision) persistence
-- Stores ONLY the analysis output + metrics snapshot.
-- IMPORTANT: LLM API keys are never stored in the DB (they remain in the user's browser).

create table if not exists public.creative_analyses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  platform text not null default 'meta',
  level text not null default 'ad' check (level in ('campaign', 'adset', 'ad')),
  entity_id text not null,
  entity_name text,
  thumbnail_url text,
  period_start date,
  period_end date,
  metrics jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_analyses_company_created_at_idx
on public.creative_analyses (company_id, created_at desc);

create index if not exists creative_analyses_lookup_idx
on public.creative_analyses (company_id, level, entity_id, created_at desc);

alter table public.creative_analyses enable row level security;

drop policy if exists "Members can read creative analyses" on public.creative_analyses;
create policy "Members can read creative analyses"
on public.creative_analyses
for select
using (public.is_company_member(company_id));

drop policy if exists "Members can create creative analyses" on public.creative_analyses;
create policy "Members can create creative analyses"
on public.creative_analyses
for insert
with check (public.is_company_member(company_id) and created_by = auth.uid());

drop policy if exists "Creators can delete creative analyses" on public.creative_analyses;
create policy "Creators can delete creative analyses"
on public.creative_analyses
for delete
using (created_by = auth.uid() or public.is_company_admin(company_id));

