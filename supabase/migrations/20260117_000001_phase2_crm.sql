-- Phase 2: CRM Operacional (Roleta + criação manual de leads)
-- This migration is safe to re-run (uses create or replace / drop trigger if exists).

-- Retorna o usuário (vendedor) com menos leads atribuídos na empresa.
-- Fallback: se não houver vendedor, usa um admin/gestor.
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

-- Cria lead manualmente e aplica roleta (para UI).
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
security definer
set search_path = public
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

  v_assigned_to_user_id := public.get_salesperson_with_fewest_leads(p_company_id);

  insert into public.leads (company_id, name, email, phone, value, source, assigned_to, status, raw, last_interaction_at)
  values (
    p_company_id,
    p_name,
    p_email,
    p_phone,
    p_value,
    p_source,
    v_assigned_to_user_id,
    'new',
    coalesce(p_raw, '{}'::jsonb),
    now()
  )
  returning id into v_new_lead_id;

  return query select * from public.leads where id = v_new_lead_id;
end;
$$;

grant execute on function public.create_lead_manual(uuid, text, text, text, numeric, text, jsonb) to authenticated;

-- Trigger: aplica roleta automaticamente se o lead entrar sem assigned_to.
create or replace function public.assign_lead_if_missing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.assigned_to is null then
    new.assigned_to := public.get_salesperson_with_fewest_leads(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_lead_if_missing on public.leads;
create trigger assign_lead_if_missing
before insert on public.leads
for each row execute function public.assign_lead_if_missing();

