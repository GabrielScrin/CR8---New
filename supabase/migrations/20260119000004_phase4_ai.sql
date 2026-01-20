-- Phase 4: AI (Traffic OS)
-- - Company AI settings (prompts)
-- - AI events log (auditing/debugging)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_event_type') then
    create type public.ai_event_type as enum ('helper', 'sdr_reply', 'creative_analysis', 'weekly_report');
  end if;
end
$$;

create table if not exists public.company_ai_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  helper_prompt text,
  sdr_prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_company_ai_settings_updated_at on public.company_ai_settings;
create trigger set_company_ai_settings_updated_at
before update on public.company_ai_settings
for each row execute function public.set_updated_at();

create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  chat_id uuid references public.chats (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  event_type public.ai_event_type not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_events_company_created_at_idx on public.ai_events (company_id, created_at desc);
create index if not exists ai_events_chat_created_at_idx on public.ai_events (chat_id, created_at desc);

alter table public.company_ai_settings enable row level security;
alter table public.ai_events enable row level security;

-- company_ai_settings
drop policy if exists "Members can read company ai settings" on public.company_ai_settings;
create policy "Members can read company ai settings"
on public.company_ai_settings
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage company ai settings" on public.company_ai_settings;
create policy "Admins can manage company ai settings"
on public.company_ai_settings
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

-- ai_events
drop policy if exists "Members can read ai events" on public.ai_events;
create policy "Members can read ai events"
on public.ai_events
for select
using (public.is_company_member(company_id));

drop policy if exists "Members can create ai events" on public.ai_events;
create policy "Members can create ai events"
on public.ai_events
for insert
with check (public.is_company_member(company_id));

