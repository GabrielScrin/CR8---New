-- Phase 5: Multi-tenancy (Agency view) + Client portal (read-only) + basic white-label.

-- White-label fields (optional)
alter table if exists public.companies
  add column if not exists brand_name text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_primary_color text;

-- Helper: staff = agency team members (can operate CRM/Chat)
create or replace function public.is_company_staff(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.member_role in ('admin', 'gestor', 'vendedor')
  );
$$;

-- Leads: staff only for writes (client can still read)
drop policy if exists "Members can create leads" on public.leads;
create policy "Members can create leads"
on public.leads
for insert
with check (public.is_company_staff(company_id));

drop policy if exists "Members can update leads" on public.leads;
create policy "Members can update leads"
on public.leads
for update
using (public.is_company_staff(company_id))
with check (public.is_company_staff(company_id));

-- Chats: staff only for writes (client can still read)
drop policy if exists "Members can create chats" on public.chats;
create policy "Members can create chats"
on public.chats
for insert
with check (public.is_company_staff(company_id));

drop policy if exists "Members can update chats" on public.chats;
create policy "Members can update chats"
on public.chats
for update
using (public.is_company_staff(company_id))
with check (public.is_company_staff(company_id));

drop policy if exists "Members can create chat messages" on public.chat_messages;
create policy "Members can create chat messages"
on public.chat_messages
for insert
with check (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and public.is_company_staff(c.company_id)
  )
);

