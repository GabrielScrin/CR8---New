-- Fix: allow upsert on chats(company_id, platform, external_thread_id)
-- Postgres cannot use a *partial* unique index as ON CONFLICT arbiter without matching predicate.
-- Using a regular unique index still allows multiple NULL external_thread_id values.

drop index if exists public.chats_company_platform_external_thread_uq;

create unique index if not exists chats_company_platform_external_thread_uq
  on public.chats (company_id, platform, external_thread_id);

