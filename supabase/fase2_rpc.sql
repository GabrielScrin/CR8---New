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
