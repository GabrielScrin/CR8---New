create table if not exists public.client_portals (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  name text not null,
  default_company_id uuid not null references public.companies (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  theme_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_portal_companies (
  portal_id uuid not null references public.client_portals (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (portal_id, company_id)
);

create index if not exists client_portals_default_company_idx
  on public.client_portals (default_company_id, created_at desc);

create index if not exists client_portals_public_token_idx
  on public.client_portals (public_token);

create index if not exists client_portal_companies_company_idx
  on public.client_portal_companies (company_id, display_order);

drop trigger if exists set_client_portals_updated_at on public.client_portals;
create trigger set_client_portals_updated_at
before update on public.client_portals
for each row execute function public.set_updated_at();

alter table public.client_portals enable row level security;
alter table public.client_portal_companies enable row level security;

drop policy if exists "Admins can read client portals" on public.client_portals;
create policy "Admins can read client portals"
on public.client_portals
for select
using (public.is_company_admin(default_company_id));

drop policy if exists "Admins can create client portals" on public.client_portals;
create policy "Admins can create client portals"
on public.client_portals
for insert
with check (public.is_company_admin(default_company_id));

drop policy if exists "Admins can update client portals" on public.client_portals;
create policy "Admins can update client portals"
on public.client_portals
for update
using (public.is_company_admin(default_company_id))
with check (public.is_company_admin(default_company_id));

drop policy if exists "Admins can delete client portals" on public.client_portals;
create policy "Admins can delete client portals"
on public.client_portals
for delete
using (public.is_company_admin(default_company_id));

drop policy if exists "Admins can read portal companies" on public.client_portal_companies;
create policy "Admins can read portal companies"
on public.client_portal_companies
for select
using (
  exists (
    select 1
    from public.client_portals p
    where p.id = portal_id
      and public.is_company_admin(p.default_company_id)
  )
  or public.is_company_admin(company_id)
);

drop policy if exists "Admins can manage portal companies" on public.client_portal_companies;
create policy "Admins can manage portal companies"
on public.client_portal_companies
for all
using (
  exists (
    select 1
    from public.client_portals p
    where p.id = portal_id
      and public.is_company_admin(p.default_company_id)
      and public.is_company_admin(company_id)
  )
)
with check (
  exists (
    select 1
    from public.client_portals p
    where p.id = portal_id
      and public.is_company_admin(p.default_company_id)
      and public.is_company_admin(company_id)
  )
);
