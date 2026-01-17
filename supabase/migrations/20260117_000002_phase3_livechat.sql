-- Phase 3: Omnichannel / Live Chat real
-- Adds session management (assumir conversa vs modo IA) and unread tracking.

-- Chats: add session fields
alter table if exists public.chats
  add column if not exists ai_active boolean not null default true,
  add column if not exists taken_by uuid references public.users (id) on delete set null,
  add column if not exists taken_at timestamptz,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists raw jsonb not null default '{}'::jsonb;

create index if not exists chats_company_last_message_at_idx on public.chats (company_id, last_message_at desc);

drop index if exists public.chats_company_external_thread_uq;
create unique index if not exists chats_company_platform_external_thread_uq
  on public.chats (company_id, platform, external_thread_id)
  where external_thread_id is not null;

-- Per-user read state (unread badge)
create table if not exists public.chat_reads (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_reads_user_idx on public.chat_reads (user_id);

alter table public.chat_reads enable row level security;

drop policy if exists "Users can read own chat reads" on public.chat_reads;
create policy "Users can read own chat reads"
on public.chat_reads
for select
using (user_id = auth.uid());

drop policy if exists "Users can upsert own chat reads" on public.chat_reads;
create policy "Users can upsert own chat reads"
on public.chat_reads
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update own chat reads" on public.chat_reads;
create policy "Users can update own chat reads"
on public.chat_reads
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
