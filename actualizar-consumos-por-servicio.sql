-- Pedidos Clean It · módulo de consumos por servicio
-- Ejecutar en Supabase > SQL Editor sobre el proyecto actual.
-- No modifica pedidos existentes. Agrega índices y funciones de reporte exclusivas para administradores.

create index if not exists idx_orders_consumption_delivered
  on public.orders(service_id, closed_at, updated_at)
  where status = 'entregado';

create index if not exists idx_order_items_consumption_material
  on public.order_items(order_id, material_id);

create or replace function public.admin_consumption_service_summary(
  p_month date default date_trunc('month', now())::date,
  p_service_id uuid default null
)
returns table(
  service_id uuid,
  service_name text,
  month_orders bigint,
  month_products bigint,
  month_amount numeric,
  previous_month_amount numeric,
  avg_previous_3_amount numeric,
  previous_3_months_with_activity bigint,
  historical_amount numeric,
  historical_orders bigint,
  last_consumption_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  p_month := date_trunc('month', coalesce(p_month, current_date))::date;

  return query
  with delivered_orders as (
    select
      o.id as order_id,
      o.service_id,
      date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date as consumption_month,
      coalesce(o.closed_at, o.updated_at, o.created_at) as consumed_at,
      o.total_amount
    from public.orders o
    where o.status = 'entregado'
      and (p_service_id is null or o.service_id = p_service_id)
  ),
  product_counts as (
    select
      d.service_id,
      count(distinct case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end)::bigint as products
    from delivered_orders d
    join public.order_items oi on oi.order_id = d.order_id
    where d.consumption_month = p_month
    group by d.service_id
  )
  select
    s.id,
    s.name,
    count(distinct d.order_id) filter (where d.consumption_month = p_month)::bigint as month_orders,
    coalesce(pc.products, 0)::bigint as month_products,
    coalesce(sum(d.total_amount) filter (where d.consumption_month = p_month), 0)::numeric as month_amount,
    coalesce(sum(d.total_amount) filter (where d.consumption_month = (p_month - interval '1 month')::date), 0)::numeric as previous_month_amount,
    (coalesce(sum(d.total_amount) filter (
      where d.consumption_month >= (p_month - interval '3 months')::date
        and d.consumption_month < p_month
    ), 0) / 3.0)::numeric as avg_previous_3_amount,
    count(distinct d.consumption_month) filter (
      where d.consumption_month >= (p_month - interval '3 months')::date
        and d.consumption_month < p_month
    )::bigint as previous_3_months_with_activity,
    coalesce(sum(d.total_amount), 0)::numeric as historical_amount,
    count(distinct d.order_id)::bigint as historical_orders,
    max(d.consumed_at) as last_consumption_at
  from public.services s
  left join delivered_orders d on d.service_id = s.id
  left join product_counts pc on pc.service_id = s.id
  where p_service_id is null or s.id = p_service_id
  group by s.id, s.name, pc.products
  order by s.name;
end;
$$;

create or replace function public.admin_consumption_report(
  p_month date default date_trunc('month', now())::date,
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
  month_quantity numeric,
  month_amount numeric,
  month_orders bigint,
  previous_month_quantity numeric,
  previous_month_amount numeric,
  avg_previous_3_quantity numeric,
  avg_previous_3_amount numeric,
  previous_3_months_with_activity bigint,
  historical_quantity numeric,
  historical_amount numeric,
  historical_orders bigint,
  last_consumption_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  p_month := date_trunc('month', coalesce(p_month, current_date))::date;

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
      count(distinct d.order_id)::bigint as orders,
      max(d.consumed_at) as last_consumption_at
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
    coalesce(sum(m.quantity) filter (where m.consumption_month = p_month), 0)::numeric as month_quantity,
    coalesce(sum(m.amount) filter (where m.consumption_month = p_month), 0)::numeric as month_amount,
    coalesce(sum(m.orders) filter (where m.consumption_month = p_month), 0)::bigint as month_orders,
    coalesce(sum(m.quantity) filter (where m.consumption_month = (p_month - interval '1 month')::date), 0)::numeric as previous_month_quantity,
    coalesce(sum(m.amount) filter (where m.consumption_month = (p_month - interval '1 month')::date), 0)::numeric as previous_month_amount,
    (coalesce(sum(m.quantity) filter (
      where m.consumption_month >= (p_month - interval '3 months')::date
        and m.consumption_month < p_month
    ), 0) / 3.0)::numeric as avg_previous_3_quantity,
    (coalesce(sum(m.amount) filter (
      where m.consumption_month >= (p_month - interval '3 months')::date
        and m.consumption_month < p_month
    ), 0) / 3.0)::numeric as avg_previous_3_amount,
    count(distinct m.consumption_month) filter (
      where m.consumption_month >= (p_month - interval '3 months')::date
        and m.consumption_month < p_month
        and m.quantity > 0
    )::bigint as previous_3_months_with_activity,
    coalesce(sum(m.quantity), 0)::numeric as historical_quantity,
    coalesce(sum(m.amount), 0)::numeric as historical_amount,
    coalesce(sum(m.orders), 0)::bigint as historical_orders,
    max(m.last_consumption_at) as last_consumption_at
  from dimensions dim
  left join monthly m
    on m.service_id = dim.service_id
   and m.material_key = dim.material_key
  group by
    dim.service_id,
    dim.service_name,
    dim.material_key,
    dim.material_id,
    dim.item_name,
    dim.item_sku,
    dim.unit
  order by dim.service_name, dim.item_name;
end;
$$;

create or replace function public.admin_consumption_history(
  p_service_id uuid,
  p_material_key text,
  p_until_month date default date_trunc('month', now())::date,
  p_months integer default 12
)
returns table(
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
  if p_service_id is null or nullif(btrim(p_material_key), '') is null then
    raise exception 'Servicio e insumo son obligatorios.';
  end if;

  p_until_month := date_trunc('month', coalesce(p_until_month, current_date))::date;
  p_months := greatest(3, least(coalesce(p_months, 12), 36));

  return query
  with months as (
    select generate_series(
      p_until_month - make_interval(months => p_months - 1),
      p_until_month,
      interval '1 month'
    )::date as consumption_month
  ),
  delivered_items as (
    select
      date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date as consumption_month,
      o.id as order_id,
      oi.quantity,
      oi.line_total,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as material_key
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and o.service_id = p_service_id
  ),
  monthly as (
    select
      d.consumption_month,
      sum(d.quantity)::numeric as quantity,
      sum(d.line_total)::numeric as amount,
      count(distinct d.order_id)::bigint as orders
    from delivered_items d
    where d.material_key = p_material_key
    group by d.consumption_month
  )
  select
    m.consumption_month,
    coalesce(a.quantity, 0)::numeric,
    coalesce(a.amount, 0)::numeric,
    coalesce(a.orders, 0)::bigint
  from months m
  left join monthly a on a.consumption_month = m.consumption_month
  order by m.consumption_month;
end;
$$;

revoke all on function public.admin_consumption_service_summary(date, uuid) from public;
revoke all on function public.admin_consumption_report(date, uuid) from public;
revoke all on function public.admin_consumption_history(uuid, text, date, integer) from public;

grant execute on function public.admin_consumption_service_summary(date, uuid) to authenticated;
grant execute on function public.admin_consumption_report(date, uuid) to authenticated;
grant execute on function public.admin_consumption_history(uuid, text, date, integer) to authenticated;
