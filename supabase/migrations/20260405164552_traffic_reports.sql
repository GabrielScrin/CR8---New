
-- Traffic Reports: stores generated weekly/periodic reports for sharing with clients
create table if not exists public.traffic_reports (
  id          uuid primary key default gen_random_uuid(),
  public_id   uuid unique not null default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  title       text not null,
  period_start date not null,
  period_end   date not null,
  report_data  jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

-- Indexes
create index if not exists traffic_reports_company_id_idx on public.traffic_reports(company_id);
create index if not exists traffic_reports_public_id_idx on public.traffic_reports(public_id);
create index if not exists traffic_reports_created_at_idx on public.traffic_reports(created_at desc);

-- RLS
alter table public.traffic_reports enable row level security;

-- Company members can manage their own reports
create policy "Members can manage company traffic reports"
  on public.traffic_reports
  for all
  using (
    exists (
      select 1 from public.company_members
      where company_members.company_id = traffic_reports.company_id
        and company_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.company_members
      where company_members.company_id = traffic_reports.company_id
        and company_members.user_id = auth.uid()
    )
  );

-- Anonymous users can read any report (public_id is a hard-to-guess UUID — security by obscurity)
create policy "Public read traffic reports by public_id"
  on public.traffic_reports
  for select
  to anon
  using (true);
;
