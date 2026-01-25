-- Phase: Contacts (Leads as Contacts) - Google Ads Offline Conversions triggers
-- This migration extends the Phase 00017 contact/timeline schema by enqueuing Google Ads
-- conversion events when:
-- - A lead is created with a click id (gclid/gbraid/wbraid)
-- - A lead is marked as won (purchase)
-- - A click id is added later (retroactive lead conversion)

-- -----------------------------------------------------------------------------
-- Triggers: lead_created + pipeline stage changes -> conversion_events outbox
-- -----------------------------------------------------------------------------

create or replace function public.lead_after_insert_events()
returns trigger
language plpgsql
as $$
declare
  v_company record;
begin
  insert into public.lead_events (company_id, lead_id, type, channel, summary, raw, occurred_at)
  values (
    new.company_id,
    new.id,
    'lead_created',
    coalesce(new.first_touch_channel, 'system'),
    'Lead criado',
    jsonb_build_object(
      'source', new.source,
      'utm_source', new.utm_source,
      'utm_medium', new.utm_medium,
      'utm_campaign', new.utm_campaign,
      'utm_content', new.utm_content,
      'utm_term', new.utm_term,
      'landing_page_url', new.landing_page_url,
      'referrer_url', new.referrer_url,
      'gclid', new.gclid,
      'gbraid', new.gbraid,
      'wbraid', new.wbraid,
      'fbclid', new.fbclid,
      'fbc', new.fbc,
      'fbp', new.fbp
    ),
    coalesce(new.first_touch_at, new.created_at, now())
  );

  -- Outbox: Google Ads click conversion (lead) when we have click ids.
  select
    c.google_ads_customer_id,
    c.google_ads_conversion_action_lead,
    c.google_ads_currency_code
  into v_company
  from public.companies c
  where c.id = new.company_id;

  if v_company.google_ads_conversion_action_lead is not null
     and (new.gclid is not null or new.gbraid is not null or new.wbraid is not null) then
    perform public.queue_conversion_event(
      new.company_id,
      new.id,
      'google_ads',
      'lead',
      'lead:' || new.id::text || ':lead',
      coalesce(new.first_touch_at, new.created_at, now()),
      jsonb_build_object(
        'event', 'lead',
        'conversion_action', v_company.google_ads_conversion_action_lead,
        'customer_id', v_company.google_ads_customer_id,
        'currency_code', coalesce(v_company.google_ads_currency_code, 'BRL'),
        'value', coalesce(new.value, 0),
        'gclid', new.gclid,
        'gbraid', new.gbraid,
        'wbraid', new.wbraid
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists lead_after_insert_events on public.leads;
create trigger lead_after_insert_events
after insert on public.leads
for each row execute function public.lead_after_insert_events();

create or replace function public.lead_after_update_events()
returns trigger
language plpgsql
as $$
declare
  v_company record;
begin
  -- Status change -> timeline
  if old.status is distinct from new.status then
    insert into public.lead_events (company_id, lead_id, type, channel, summary, raw, occurred_at)
    values (
      new.company_id,
      new.id,
      'pipeline_stage_change',
      'crm',
      'Mudança no pipeline',
      jsonb_build_object('from', old.status, 'to', new.status),
      now()
    );
  end if;

  -- Outbox: Google Ads click conversion (purchase) when the lead is won.
  if old.status is distinct from new.status and new.status = 'won' then
    select
      c.google_ads_customer_id,
      c.google_ads_conversion_action_purchase,
      c.google_ads_currency_code
    into v_company
    from public.companies c
    where c.id = new.company_id;

    if v_company.google_ads_conversion_action_purchase is not null
       and (new.gclid is not null or new.gbraid is not null or new.wbraid is not null) then
      perform public.queue_conversion_event(
        new.company_id,
        new.id,
        'google_ads',
        'purchase',
        'lead:' || new.id::text || ':purchase',
        now(),
        jsonb_build_object(
          'event', 'purchase',
          'conversion_action', v_company.google_ads_conversion_action_purchase,
          'customer_id', v_company.google_ads_customer_id,
          'currency_code', coalesce(v_company.google_ads_currency_code, 'BRL'),
          'value', coalesce(new.value, 0),
          'gclid', new.gclid,
          'gbraid', new.gbraid,
          'wbraid', new.wbraid
        )
      );
    end if;
  end if;

  -- Outbox: if click ids were added later, queue the lead conversion once.
  if (old.gclid is distinct from new.gclid)
     or (old.gbraid is distinct from new.gbraid)
     or (old.wbraid is distinct from new.wbraid) then
    select
      c.google_ads_customer_id,
      c.google_ads_conversion_action_lead,
      c.google_ads_currency_code
    into v_company
    from public.companies c
    where c.id = new.company_id;

    if v_company.google_ads_conversion_action_lead is not null
       and (new.gclid is not null or new.gbraid is not null or new.wbraid is not null) then
      perform public.queue_conversion_event(
        new.company_id,
        new.id,
        'google_ads',
        'lead',
        'lead:' || new.id::text || ':lead',
        now(),
        jsonb_build_object(
          'event', 'lead',
          'conversion_action', v_company.google_ads_conversion_action_lead,
          'customer_id', v_company.google_ads_customer_id,
          'currency_code', coalesce(v_company.google_ads_currency_code, 'BRL'),
          'value', coalesce(new.value, 0),
          'gclid', new.gclid,
          'gbraid', new.gbraid,
          'wbraid', new.wbraid
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_after_update_events on public.leads;
create trigger lead_after_update_events
after update on public.leads
for each row execute function public.lead_after_update_events();
