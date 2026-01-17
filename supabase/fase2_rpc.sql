-- Supabase SQL (Phase 2)
-- OBS: o conteúdo principal também existe em `supabase/schema.sql`.

create or replace function public.get_salesperson_with_fewest_leads(p_company_id uuid)
returns uuid
language sql
stable
as $$
  with sellers as (
    select cm.user_id
    from public.company_members as cm
    where cm.company_id = p_company_id
      and cm.member_role = 'vendedor'
  ),
  seller_choice as (
    select s.user_id
    from sellers s
    left join public.leads l on l.assigned_to = s.user_id and l.company_id = p_company_id
    group by s.user_id
    order by count(l.id) asc, random()
    limit 1
  ),
  fallback_choice as (
    select cm.user_id
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.member_role in ('admin', 'gestor')
    order by cm.created_at asc
    limit 1
  )
  select coalesce((select user_id from seller_choice), (select user_id from fallback_choice));
$$;

grant execute on function public.get_salesperson_with_fewest_leads(uuid) to authenticated, service_role;

-- RPC function to manually create a lead and assign it (for UI use)
create or replace function public.create_lead_manual(
    p_company_id uuid,
    p_name text,
    p_email text default null,
    p_phone text default null,
    p_value numeric default null,
    p_source text default 'Manual',
    p_raw jsonb default null
)
returns setof public.leads
language plpgsql
security definer -- to allow calling the assignment function
as $$
declare
    v_assigned_to_user_id uuid;
    v_new_lead_id uuid;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;

    if not public.is_company_member(p_company_id) then
        raise exception 'not a company member';
    end if;

    -- 1. Get the salesperson to assign the lead to
    v_assigned_to_user_id := public.get_salesperson_with_fewest_leads(p_company_id);

    -- 2. Insert the new lead
    insert into public.leads (company_id, name, email, phone, value, source, assigned_to, status, raw, last_interaction_at)
    values (p_company_id, p_name, p_email, p_phone, p_value, p_source, v_assigned_to_user_id, 'new', coalesce(p_raw, '{}'::jsonb), now())
    returning id into v_new_lead_id;

    -- 3. Return the newly created lead record
    return query select * from public.leads where id = v_new_lead_id;
end;
$$;

grant execute on function public.create_lead_manual(uuid, text, text, text, numeric, text, jsonb) to authenticated;
