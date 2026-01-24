-- Phase 4: Weekly reports (automatic, deterministic)
-- Goal: generate a weekly summary on Mondays without storing any LLM API key in the backend.

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  summary text,
  highlights text[] not null default '{}'::text[],
  risks text[] not null default '{}'::text[],
  next_week text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reports_period_check check (period_end > period_start)
);

create unique index if not exists weekly_reports_company_period_uq
on public.weekly_reports (company_id, period_start, period_end);

create index if not exists weekly_reports_company_start_idx
on public.weekly_reports (company_id, period_start desc);

drop trigger if exists set_weekly_reports_updated_at on public.weekly_reports;
create trigger set_weekly_reports_updated_at
before update on public.weekly_reports
for each row execute function public.set_updated_at();

alter table public.weekly_reports enable row level security;

drop policy if exists "Members can read weekly reports" on public.weekly_reports;
create policy "Members can read weekly reports"
on public.weekly_reports
for select
using (public.is_company_member(company_id));

-- -----------------------------------------------------------------------------
-- Generator
-- -----------------------------------------------------------------------------

create or replace function public.generate_weekly_report(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.weekly_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_days int;
  v_prev_start date;
  v_prev_end date;
  v_prev_start_ts timestamptz;
  v_prev_end_ts timestamptz;

  v_leads_created int := 0;
  v_leads_won int := 0;
  v_revenue_won numeric := 0;
  v_pending_followup int := 0;

  v_prev_leads_created int := 0;
  v_prev_leads_won int := 0;
  v_prev_revenue_won numeric := 0;

  v_messages_in int := 0;
  v_messages_out int := 0;
  v_new_chats int := 0;
  v_active_chats int := 0;

  v_prev_messages_in int := 0;
  v_prev_messages_out int := 0;
  v_prev_new_chats int := 0;
  v_prev_active_chats int := 0;

  v_top_sources jsonb := '[]'::jsonb;

  v_delta_leads numeric := 0;
  v_delta_won numeric := 0;
  v_delta_revenue numeric := 0;
  v_delta_in numeric := 0;
  v_delta_out numeric := 0;

  v_summary text := null;
  v_highlights text[] := '{}'::text[];
  v_risks text[] := '{}'::text[];
  v_next_week text[] := '{}'::text[];

  v_metrics jsonb := '{}'::jsonb;
  v_report public.weekly_reports;
begin
  if p_company_id is null then
    raise exception 'missing company_id';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'invalid period';
  end if;

  -- If called from PostgREST (auth context), enforce membership.
  if auth.uid() is not null then
    if not public.is_company_member(p_company_id) then
      raise exception 'not a company member';
    end if;
  end if;

  v_start_ts := (p_period_start::timestamp at time zone 'UTC');
  v_end_ts := (p_period_end::timestamp at time zone 'UTC');

  v_days := (p_period_end - p_period_start);
  v_prev_start := p_period_start - v_days;
  v_prev_end := p_period_start;
  v_prev_start_ts := (v_prev_start::timestamp at time zone 'UTC');
  v_prev_end_ts := v_start_ts;

  -- Leads
  select count(*) into v_leads_created
  from public.leads
  where company_id = p_company_id
    and created_at >= v_start_ts
    and created_at < v_end_ts;

  select count(*) into v_leads_won
  from public.leads
  where company_id = p_company_id
    and status = 'won'
    and updated_at >= v_start_ts
    and updated_at < v_end_ts;

  select coalesce(sum(value), 0) into v_revenue_won
  from public.leads
  where company_id = p_company_id
    and status = 'won'
    and updated_at >= v_start_ts
    and updated_at < v_end_ts;

  select count(*) into v_pending_followup
  from public.leads
  where company_id = p_company_id
    and coalesce(status, 'new') not in ('won', 'lost')
    and created_at < (v_end_ts - interval '2 days')
    and (last_interaction_at is null or last_interaction_at < (v_end_ts - interval '2 days'));

  -- Messages / chats
  select count(*) into v_messages_in
  from public.chat_messages m
  join public.chats c on c.id = m.chat_id
  where c.company_id = p_company_id
    and m.created_at >= v_start_ts
    and m.created_at < v_end_ts
    and m.sender = 'user';

  select count(*) into v_messages_out
  from public.chat_messages m
  join public.chats c on c.id = m.chat_id
  where c.company_id = p_company_id
    and m.created_at >= v_start_ts
    and m.created_at < v_end_ts
    and m.sender in ('agent', 'system');

  select count(*) into v_new_chats
  from public.chats
  where company_id = p_company_id
    and created_at >= v_start_ts
    and created_at < v_end_ts;

  select count(distinct m.chat_id) into v_active_chats
  from public.chat_messages m
  join public.chats c on c.id = m.chat_id
  where c.company_id = p_company_id
    and m.created_at >= v_start_ts
    and m.created_at < v_end_ts;

  -- Top sources (raw leads.source)
  select coalesce(
    jsonb_agg(
      jsonb_build_object('source', s.source, 'count', s.cnt)
      order by s.cnt desc
    ),
    '[]'::jsonb
  ) into v_top_sources
  from (
    select coalesce(source, '(sem fonte)') as source, count(*)::int as cnt
    from public.leads
    where company_id = p_company_id
      and created_at >= v_start_ts
      and created_at < v_end_ts
    group by 1
    order by 2 desc
    limit 5
  ) s;

  -- Previous period (for deltas)
  select count(*) into v_prev_leads_created
  from public.leads
  where company_id = p_company_id
    and created_at >= v_prev_start_ts
    and created_at < v_prev_end_ts;

  select count(*) into v_prev_leads_won
  from public.leads
  where company_id = p_company_id
    and status = 'won'
    and updated_at >= v_prev_start_ts
    and updated_at < v_prev_end_ts;

  select coalesce(sum(value), 0) into v_prev_revenue_won
  from public.leads
  where company_id = p_company_id
    and status = 'won'
    and updated_at >= v_prev_start_ts
    and updated_at < v_prev_end_ts;

  select count(*) into v_prev_messages_in
  from public.chat_messages m
  join public.chats c on c.id = m.chat_id
  where c.company_id = p_company_id
    and m.created_at >= v_prev_start_ts
    and m.created_at < v_prev_end_ts
    and m.sender = 'user';

  select count(*) into v_prev_messages_out
  from public.chat_messages m
  join public.chats c on c.id = m.chat_id
  where c.company_id = p_company_id
    and m.created_at >= v_prev_start_ts
    and m.created_at < v_prev_end_ts
    and m.sender in ('agent', 'system');

  select count(*) into v_prev_new_chats
  from public.chats
  where company_id = p_company_id
    and created_at >= v_prev_start_ts
    and created_at < v_prev_end_ts;

  select count(distinct m.chat_id) into v_prev_active_chats
  from public.chat_messages m
  join public.chats c on c.id = m.chat_id
  where c.company_id = p_company_id
    and m.created_at >= v_prev_start_ts
    and m.created_at < v_prev_end_ts;

  v_delta_leads := case
    when v_prev_leads_created > 0 then ((v_leads_created - v_prev_leads_created)::numeric / v_prev_leads_created) * 100
    when v_leads_created > 0 then 100
    else 0
  end;

  v_delta_won := case
    when v_prev_leads_won > 0 then ((v_leads_won - v_prev_leads_won)::numeric / v_prev_leads_won) * 100
    when v_leads_won > 0 then 100
    else 0
  end;

  v_delta_revenue := case
    when v_prev_revenue_won > 0 then ((v_revenue_won - v_prev_revenue_won) / v_prev_revenue_won) * 100
    when v_revenue_won > 0 then 100
    else 0
  end;

  v_delta_in := case
    when v_prev_messages_in > 0 then ((v_messages_in - v_prev_messages_in)::numeric / v_prev_messages_in) * 100
    when v_messages_in > 0 then 100
    else 0
  end;

  v_delta_out := case
    when v_prev_messages_out > 0 then ((v_messages_out - v_prev_messages_out)::numeric / v_prev_messages_out) * 100
    when v_messages_out > 0 then 100
    else 0
  end;

  v_summary := format(
    'Semana %s a %s: %s leads (%s%%), %s vendas (won) (%s%%), receita %s (%s%%). Mensagens: %s recebidas (%s%%) e %s enviadas (%s%%).',
    to_char(p_period_start, 'YYYY-MM-DD'),
    to_char((p_period_end - 1), 'YYYY-MM-DD'),
    v_leads_created,
    round(v_delta_leads, 1),
    v_leads_won,
    round(v_delta_won, 1),
    v_revenue_won,
    round(v_delta_revenue, 1),
    v_messages_in,
    round(v_delta_in, 1),
    v_messages_out,
    round(v_delta_out, 1)
  );

  v_highlights := v_highlights || format('Leads captados: %s (Δ %s%%)', v_leads_created, round(v_delta_leads, 1));
  v_highlights := v_highlights || format('Vendas (won): %s (Δ %s%%)', v_leads_won, round(v_delta_won, 1));
  v_highlights := v_highlights || format('Receita (won): %s (Δ %s%%)', v_revenue_won, round(v_delta_revenue, 1));
  v_highlights := v_highlights || format('Mensagens recebidas: %s (Δ %s%%)', v_messages_in, round(v_delta_in, 1));
  v_highlights := v_highlights || format('Mensagens enviadas: %s (Δ %s%%)', v_messages_out, round(v_delta_out, 1));

  if v_leads_created = 0 then
    v_risks := v_risks || 'Nenhum lead captado no período.';
    v_next_week := v_next_week || 'Verifique campanhas, formulários e webhooks de captação de leads.';
  end if;

  if v_leads_created > 0 and v_leads_won = 0 then
    v_risks := v_risks || 'Sem vendas (won) registradas no período.';
    v_next_week := v_next_week || 'Revise follow-up e status no CRM para não perder oportunidades.';
  end if;

  if v_messages_in > 0 and v_messages_out = 0 then
    v_risks := v_risks || 'Chegaram mensagens mas nenhuma resposta foi enviada pelo painel.';
    v_next_week := v_next_week || 'Teste o Live Chat e verifique o envio outbound pela Cloud API.';
  end if;

  if v_pending_followup > 0 then
    v_risks := v_risks || format('%s leads aguardando follow-up (>2 dias).', v_pending_followup);
    v_next_week := v_next_week || 'Crie uma rotina diária de follow-up e distribua leads entre vendedores.';
  end if;

  if array_length(v_next_week, 1) is null then
    v_next_week := v_next_week || 'Mantenha o ritmo: valide fontes de leads, responda rápido e atualize o CRM.';
  end if;

  v_metrics := jsonb_build_object(
    'period', jsonb_build_object(
      'start', p_period_start,
      'end', p_period_end,
      'days', v_days
    ),
    'leads', jsonb_build_object(
      'created', v_leads_created,
      'won', v_leads_won,
      'revenue_won', v_revenue_won,
      'pending_followup', v_pending_followup,
      'top_sources', v_top_sources,
      'previous', jsonb_build_object(
        'created', v_prev_leads_created,
        'won', v_prev_leads_won,
        'revenue_won', v_prev_revenue_won
      ),
      'delta_pct', jsonb_build_object(
        'created', round(v_delta_leads, 3),
        'won', round(v_delta_won, 3),
        'revenue_won', round(v_delta_revenue, 3)
      )
    ),
    'messages', jsonb_build_object(
      'inbound', v_messages_in,
      'outbound', v_messages_out,
      'new_chats', v_new_chats,
      'active_chats', v_active_chats,
      'previous', jsonb_build_object(
        'inbound', v_prev_messages_in,
        'outbound', v_prev_messages_out,
        'new_chats', v_prev_new_chats,
        'active_chats', v_prev_active_chats
      ),
      'delta_pct', jsonb_build_object(
        'inbound', round(v_delta_in, 3),
        'outbound', round(v_delta_out, 3)
      )
    )
  );

  insert into public.weekly_reports (company_id, period_start, period_end, metrics, summary, highlights, risks, next_week)
  values (p_company_id, p_period_start, p_period_end, v_metrics, v_summary, v_highlights, v_risks, v_next_week)
  on conflict (company_id, period_start, period_end)
  do update set
    metrics = excluded.metrics,
    summary = excluded.summary,
    highlights = excluded.highlights,
    risks = excluded.risks,
    next_week = excluded.next_week,
    updated_at = now()
  returning * into v_report;

  return v_report;
end;
$$;

-- Request report for the last fully completed week (Mon-Sun) in UTC
create or replace function public.request_weekly_report(p_company_id uuid)
returns public.weekly_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date;
  v_start date;
  v_end date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_company_admin(p_company_id) then
    raise exception 'not allowed';
  end if;

  v_week_start := date_trunc('week', now() at time zone 'UTC')::date; -- Monday of current week
  v_start := v_week_start - 7;
  v_end := v_week_start;

  return public.generate_weekly_report(p_company_id, v_start, v_end);
end;
$$;

grant execute on function public.request_weekly_report(uuid) to authenticated;

-- Generate for all companies (used by cron / internal ops)
create or replace function public.generate_weekly_reports_for_all()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date;
  v_start date;
  v_end date;
  v_count int := 0;
  c record;
begin
  v_week_start := date_trunc('week', now() at time zone 'UTC')::date;
  v_start := v_week_start - 7;
  v_end := v_week_start;

  for c in select id from public.companies loop
    perform public.generate_weekly_report(c.id, v_start, v_end);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scheduler (pg_cron) - run every Monday at 12:00 UTC (~09:00 Sao Paulo)
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when insufficient_privilege then
      raise notice 'pg_cron not available (insufficient privilege); skipping schedule.';
  end;

  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'cr8_weekly_reports') then
      perform cron.schedule(
        'cr8_weekly_reports',
        '0 12 * * 1',
        $cron$select public.generate_weekly_reports_for_all();$cron$
      );
    end if;
  end if;
end
$$;
