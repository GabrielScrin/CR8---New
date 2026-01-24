-- Phase 3 hardening: Inbox (LiveChat) reliability
-- - Add provider message id + delivery status fields
-- - Enable Realtime for chats / chat_messages / chat_reads

-- -----------------------------------------------------------------------------
-- Message dedupe + status tracking
-- -----------------------------------------------------------------------------

alter table if exists public.chat_messages
  add column if not exists external_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text;

-- Unique ID from providers (WhatsApp: messages[].id)
-- Multiple NULLs are allowed in Postgres unique indexes, so this stays safe for
-- messages that don't have an external id.
create unique index if not exists chat_messages_chat_external_message_uq
  on public.chat_messages (chat_id, external_message_id);

-- -----------------------------------------------------------------------------
-- Realtime (required for LiveChat subscriptions)
-- -----------------------------------------------------------------------------

do $$
begin
  -- Ensure UPDATE events include row data for clients
  begin
    execute 'alter table public.chats replica identity full';
  exception when others then
    -- best-effort (might fail if permissions differ)
    null;
  end;

  -- Add tables to realtime publication (best-effort / idempotent)
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chats'
  ) then
    execute 'alter publication supabase_realtime add table public.chats';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_reads'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_reads';
  end if;
end
$$;

