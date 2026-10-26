-- Pedidos Clean It · analítica avanzada de consumos
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- No modifica pedidos ni consumos históricos. Solo agrega una función de lectura para administradores.

create or replace function public.admin_consumption_analytics(
  p_until_month date default date_trunc('month', now())::date,
  p_months integer default 12,
  p_service_id uuid default null
)
returns table(
  service_id uuid,
  service_name text,
  material_key text,
  material_id uuid,
  item_name text,
  item_sku text,
  unit text,
  consumption_month date,
  quantity numeric,
  amount numeric,
  orders bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  p_until_month := date_trunc('month', coalesce(p_until_month, current_date))::date;
  p_months := greatest(3, least(coalesce(p_months, 12), 24));

  return query
  with delivered_items as (
    select
      o.service_id,
      s.name as service_name,
      o.id as order_id,
      date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date as consumption_month,
      coalesce(o.closed_at, o.updated_at, o.created_at) as consumed_at,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as material_key,
      oi.material_id,
      oi.item_name,
      oi.item_sku,
      coalesce(nullif(btrim(oi.unit), ''), 'unidad') as unit,
      oi.quantity,
      oi.line_total
    from public.orders o
    join public.services s on s.id = o.service_id
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and (p_service_id is null or o.service_id = p_service_id)
      and date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date
          between (p_until_month - make_interval(months => p_months - 1))::date and p_until_month
  ),
  dimensions as (
    select distinct on (d.service_id, d.material_key)
      d.service_id,
      d.service_name,
      d.material_key,
      d.material_id,
      d.item_name,
      d.item_sku,
      d.unit
    from delivered_items d
    order by d.service_id, d.material_key, d.consumed_at desc, d.order_id desc
  ),
  monthly as (
    select
      d.service_id,
      d.material_key,
      d.consumption_month,
      sum(d.quantity)::numeric as quantity,
      sum(d.line_total)::numeric as amount,
      count(distinct d.order_id)::bigint as orders
    from delivered_items d
    group by d.service_id, d.material_key, d.consumption_month
  )
  select
    dim.service_id,
    dim.service_name,
    dim.material_key,
    dim.material_id,
    dim.item_name,
    dim.item_sku,
    dim.unit,
    m.consumption_month,
    m.quantity,
    m.amount,
    m.orders
  from monthly m
  join dimensions dim
    on dim.service_id = m.service_id
   and dim.material_key = m.material_key
  order by m.consumption_month, dim.service_name, dim.item_name;
end;
$$;

revoke all on function public.admin_consumption_analytics(date, integer, uuid) from public;
grant execute on function public.admin_consumption_analytics(date, integer, uuid) to authenticated;
