-- Pedidos Clean It · Corrección definitiva de analítica de consumos
-- Ejecutar en Supabase > SQL Editor.
-- Reemplaza las funciones analíticas existentes. No modifica pedidos ni datos.

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
set search_path=public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  p_until_month := date_trunc('month', coalesce(p_until_month, current_date))::date;
  p_months := greatest(3, least(coalesce(p_months, 12), 60));

  return query
  with delivered_items as (
    select
      o.service_id as di_service_id,
      s.name as di_service_name,
      o.id as di_order_id,
      date_trunc(
        'month',
        coalesce(
          (
            select max(h.changed_at)
            from public.order_status_history h
            where h.order_id = o.id
              and h.new_status = 'entregado'
          ),
          o.updated_at,
          o.created_at
        )
      )::date as di_consumption_month,
      coalesce(
        (
          select max(h.changed_at)
          from public.order_status_history h
          where h.order_id = o.id
            and h.new_status = 'entregado'
        ),
        o.updated_at,
        o.created_at
      ) as di_consumed_at,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as di_material_key,
      oi.material_id as di_material_id,
      oi.item_name as di_item_name,
      oi.item_sku as di_item_sku,
      coalesce(nullif(btrim(oi.unit), ''), 'unidad') as di_unit,
      oi.quantity as di_quantity,
      oi.line_total as di_line_total
    from public.orders o
    join public.services s on s.id = o.service_id
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and (p_service_id is null or o.service_id = p_service_id)
      and date_trunc(
        'month',
        coalesce(
          (
            select max(h.changed_at)
            from public.order_status_history h
            where h.order_id = o.id
              and h.new_status = 'entregado'
          ),
          o.updated_at,
          o.created_at
        )
      )::date between (p_until_month - make_interval(months => p_months - 1))::date and p_until_month
  ),
  dimensions as (
    select distinct on (di.di_service_id, di.di_material_key)
      di.di_service_id as d_service_id,
      di.di_service_name as d_service_name,
      di.di_material_key as d_material_key,
      di.di_material_id as d_material_id,
      di.di_item_name as d_item_name,
      di.di_item_sku as d_item_sku,
      di.di_unit as d_unit
    from delivered_items di
    order by di.di_service_id, di.di_material_key, di.di_consumed_at desc, di.di_order_id desc
  ),
  monthly as (
    select
      di.di_service_id as m_service_id,
      di.di_material_key as m_material_key,
      di.di_consumption_month as m_consumption_month,
      sum(di.di_quantity)::numeric as m_quantity,
      sum(di.di_line_total)::numeric as m_amount,
      count(distinct di.di_order_id)::bigint as m_orders
    from delivered_items di
    group by di.di_service_id, di.di_material_key, di.di_consumption_month
  )
  select
    d.d_service_id,
    d.d_service_name,
    d.d_material_key,
    d.d_material_id,
    d.d_item_name,
    d.d_item_sku,
    d.d_unit,
    m.m_consumption_month,
    m.m_quantity,
    m.m_amount,
    m.m_orders
  from monthly m
  join dimensions d
    on d.d_service_id = m.m_service_id
   and d.d_material_key = m.m_material_key
  order by m.m_consumption_month, d.d_service_name, d.d_item_name;
end;
$$;

revoke all on function public.admin_consumption_analytics(date, integer, uuid) from public;
grant execute on function public.admin_consumption_analytics(date, integer, uuid) to authenticated;


create or replace function public.admin_consumption_range_bundle(
  p_from_date date,
  p_to_date date,
  p_service_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  if p_from_date is null or p_to_date is null or p_from_date > p_to_date then
    raise exception 'Rango de fechas inválido.';
  end if;

  with delivered as (
    select
      o.service_id as d_service_id,
      s.name as d_service_name,
      o.id as d_order_id,
      coalesce(
        (
          select max(h.changed_at)
          from public.order_status_history h
          where h.order_id = o.id
            and h.new_status = 'entregado'
        ),
        o.updated_at,
        o.created_at
      ) as d_consumed_at,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as d_material_key,
      oi.material_id as d_material_id,
      oi.item_name as d_item_name,
      oi.item_sku as d_item_sku,
      coalesce(nullif(btrim(oi.unit), ''), 'unidad') as d_unit,
      oi.quantity as d_quantity,
      oi.line_total as d_line_total
    from public.orders o
    join public.services s on s.id = o.service_id
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and (p_service_id is null or o.service_id = p_service_id)
      and coalesce(
        (
          select max(h.changed_at)
          from public.order_status_history h
          where h.order_id = o.id
            and h.new_status = 'entregado'
        ),
        o.updated_at,
        o.created_at
      )::date between p_from_date and p_to_date
  ),
  dims as (
    select distinct on (d.d_service_id, d.d_material_key)
      d.d_service_id as x_service_id,
      d.d_service_name as x_service_name,
      d.d_material_key as x_material_key,
      d.d_material_id as x_material_id,
      d.d_item_name as x_item_name,
      d.d_item_sku as x_item_sku,
      d.d_unit as x_unit
    from delivered d
    order by d.d_service_id, d.d_material_key, d.d_consumed_at desc, d.d_order_id desc
  ),
  services_summary as (
    select
      d.d_service_id as s_service_id,
      max(d.d_service_name) as s_service_name,
      count(distinct d.d_order_id)::bigint as range_orders,
      count(distinct d.d_material_key)::bigint as range_products,
      sum(d.d_line_total)::numeric as range_amount,
      max(d.d_consumed_at) as last_consumption_at
    from delivered d
    group by d.d_service_id
  ),
  products_summary as (
    select
      d.d_service_id as p_service_id_out,
      max(d.d_service_name) as p_service_name,
      d.d_material_key as p_material_key,
      x.x_material_id as p_material_id,
      x.x_item_name as p_item_name,
      x.x_item_sku as p_item_sku,
      x.x_unit as p_unit,
      sum(d.d_quantity)::numeric as range_quantity,
      sum(d.d_line_total)::numeric as range_amount,
      count(distinct d.d_order_id)::bigint as range_orders
    from delivered d
    join dims x
      on x.x_service_id = d.d_service_id
     and x.x_material_key = d.d_material_key
    group by d.d_service_id, d.d_material_key, x.x_material_id, x.x_item_name, x.x_item_sku, x.x_unit
  ),
  monthly_summary as (
    select
      d.d_service_id as m_service_id,
      max(d.d_service_name) as m_service_name,
      d.d_material_key as m_material_key,
      x.x_material_id as m_material_id,
      x.x_item_name as m_item_name,
      x.x_item_sku as m_item_sku,
      x.x_unit as m_unit,
      date_trunc('month', d.d_consumed_at)::date as consumption_month,
      sum(d.d_quantity)::numeric as quantity,
      sum(d.d_line_total)::numeric as amount,
      count(distinct d.d_order_id)::bigint as orders
    from delivered d
    join dims x
      on x.x_service_id = d.d_service_id
     and x.x_material_key = d.d_material_key
    group by d.d_service_id, d.d_material_key, x.x_material_id, x.x_item_name, x.x_item_sku, x.x_unit, date_trunc('month', d.d_consumed_at)::date
  )
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_id', ss.s_service_id,
        'service_name', ss.s_service_name,
        'range_orders', ss.range_orders,
        'range_products', ss.range_products,
        'range_amount', ss.range_amount,
        'last_consumption_at', ss.last_consumption_at
      ) order by ss.range_amount desc)
      from services_summary ss
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_id', ps.p_service_id_out,
        'service_name', ps.p_service_name,
        'material_key', ps.p_material_key,
        'material_id', ps.p_material_id,
        'item_name', ps.p_item_name,
        'item_sku', ps.p_item_sku,
        'unit', ps.p_unit,
        'range_quantity', ps.range_quantity,
        'range_amount', ps.range_amount,
        'range_orders', ps.range_orders
      ) order by ps.range_amount desc)
      from products_summary ps
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_id', ms.m_service_id,
        'service_name', ms.m_service_name,
        'material_key', ms.m_material_key,
        'material_id', ms.m_material_id,
        'item_name', ms.m_item_name,
        'item_sku', ms.m_item_sku,
        'unit', ms.m_unit,
        'consumption_month', ms.consumption_month,
        'quantity', ms.quantity,
        'amount', ms.amount,
        'orders', ms.orders
      ) order by ms.consumption_month, ms.m_service_name, ms.m_item_name)
      from monthly_summary ms
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_consumption_range_bundle(date, date, uuid) from public;
grant execute on function public.admin_consumption_range_bundle(date, date, uuid) to authenticated;


create or replace function public.admin_consumption_service_history(
  p_service_id uuid,
  p_months integer default 24
)
returns table(
  consumption_month date,
  amount numeric,
  orders bigint,
  products bigint
)
language plpgsql
security definer
set search_path=public
as $$
declare
  first_month date;
  start_month date;
  end_month date;
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  end_month := date_trunc('month', current_date)::date;

  if coalesce(p_months, 24) <= 0 then
    select min(
      date_trunc(
        'month',
        coalesce(
          (
            select max(h.changed_at)
            from public.order_status_history h
            where h.order_id = o.id
              and h.new_status = 'entregado'
          ),
          o.updated_at,
          o.created_at
        )
      )::date
    )
    into first_month
    from public.orders o
    where o.status = 'entregado'
      and o.service_id = p_service_id;

    start_month := coalesce(first_month, end_month);
  else
    start_month := (end_month - make_interval(months => greatest(1, p_months) - 1))::date;
  end if;

  return query
  with month_series as (
    select generate_series(start_month, end_month, interval '1 month')::date as ms_month
  ),
  delivered as (
    select
      o.id as d_order_id,
      date_trunc(
        'month',
        coalesce(
          (
            select max(h.changed_at)
            from public.order_status_history h
            where h.order_id = o.id
              and h.new_status = 'entregado'
          ),
          o.updated_at,
          o.created_at
        )
      )::date as d_month,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as d_material_key,
      oi.line_total as d_line_total
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and o.service_id = p_service_id
      and date_trunc(
        'month',
        coalesce(
          (
            select max(h.changed_at)
            from public.order_status_history h
            where h.order_id = o.id
              and h.new_status = 'entregado'
          ),
          o.updated_at,
          o.created_at
        )
      )::date between start_month and end_month
  ),
  aggregated as (
    select
      d.d_month as a_month,
      sum(d.d_line_total)::numeric as a_amount,
      count(distinct d.d_order_id)::bigint as a_orders,
      count(distinct d.d_material_key)::bigint as a_products
    from delivered d
    group by d.d_month
  )
  select
    ms.ms_month,
    coalesce(a.a_amount, 0)::numeric,
    coalesce(a.a_orders, 0)::bigint,
    coalesce(a.a_products, 0)::bigint
  from month_series ms
  left join aggregated a on a.a_month = ms.ms_month
  order by ms.ms_month;
end;
$$;

revoke all on function public.admin_consumption_service_history(uuid, integer) from public;
grant execute on function public.admin_consumption_service_history(uuid, integer) to authenticated;
