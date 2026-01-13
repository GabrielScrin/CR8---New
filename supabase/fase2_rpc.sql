-- Supabase SQL to create the RPC function for lead distribution (Phase 2)

create or replace function public.get_salesperson_with_fewest_leads(p_company_id uuid)
returns uuid
language sql
stable
as $$
  select cm.user_id
  from public.company_members as cm
  left join public.leads as l on l.assigned_to = cm.user_id and l.company_id = cm.company_id
  where cm.company_id = p_company_id
    and cm.member_role = 'vendedor'
  group by cm.user_id
  order by count(l.id) asc, random() -- `random()` breaks ties
  limit 1;
$$;

grant execute on function public.get_salesperson_with_fewest_leads(uuid) to authenticated, service_role;

-- RPC function to manually create a lead and assign it (for UI use)
create or replace function public.create_lead_manual(
    p_company_id uuid,
    p_name text,
    p_email text default null,
    p_phone text default null,
    p_value numeric default null,
    p_source text default 'Manual'
)
returns setof public.leads
language plpgsql
security definer -- to allow calling the assignment function
as $$
declare
    v_assigned_to_user_id uuid;
    v_new_lead_id uuid;
begin
    -- 1. Get the salesperson to assign the lead to
    v_assigned_to_user_id := public.get_salesperson_with_fewest_leads(p_company_id);

    -- 2. Insert the new lead
    insert into public.leads (company_id, name, email, phone, value, source, assigned_to, status)
    values (p_company_id, p_name, p_email, p_phone, p_value, p_source, v_assigned_to_user_id, 'new')
    returning id into v_new_lead_id;

    -- 3. Return the newly created lead record
    return query select * from public.leads where id = v_new_lead_id;
end;
$$;

grant execute on function public.create_lead_manual(uuid, text, text, text, numeric, text) to authenticated;
