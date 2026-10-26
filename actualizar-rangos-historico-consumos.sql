-- Pedidos Clean It · Consumos avanzados, rangos e histórico por servicio
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- No modifica pedidos ni datos históricos. Solo crea/reemplaza funciones de lectura para administradores.

create or replace function public.admin_consumption_analytics(
  p_until_month date default date_trunc('month', now())::date,
  p_months integer default 12,
  p_service_id uuid default null
)
returns table(service_id uuid,service_name text,material_key text,material_id uuid,item_name text,item_sku text,unit text,consumption_month date,quantity numeric,amount numeric,orders bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Acceso restringido a administradores.'; end if;
  p_until_month:=date_trunc('month',coalesce(p_until_month,current_date))::date;
  p_months:=greatest(3,least(coalesce(p_months,12),60));
  return query
  with delivered_items as (
    select o.service_id,s.name service_name,o.id order_id,date_trunc('month',coalesce(o.closed_at,o.updated_at,o.created_at))::date consumption_month,coalesce(o.closed_at,o.updated_at,o.created_at) consumed_at,
      case when oi.material_id is not null then 'material:'||oi.material_id::text when nullif(btrim(coalesce(oi.item_sku,'')),'') is not null then 'sku:'||lower(btrim(oi.item_sku)) else 'custom:'||md5(lower(btrim(oi.item_name))||'|'||lower(btrim(coalesce(oi.unit,'unidad')))) end material_key,
      oi.material_id,oi.item_name,oi.item_sku,coalesce(nullif(btrim(oi.unit),''),'unidad') unit,oi.quantity,oi.line_total
    from public.orders o join public.services s on s.id=o.service_id join public.order_items oi on oi.order_id=o.id
    where o.status='entregado' and (p_service_id is null or o.service_id=p_service_id)
      and date_trunc('month',coalesce(o.closed_at,o.updated_at,o.created_at))::date between (p_until_month-make_interval(months=>p_months-1))::date and p_until_month
  ), dimensions as (
    select distinct on(service_id,material_key) service_id,service_name,material_key,material_id,item_name,item_sku,unit from delivered_items order by service_id,material_key,consumed_at desc,order_id desc
  ), monthly as (
    select service_id,material_key,consumption_month,sum(quantity)::numeric quantity,sum(line_total)::numeric amount,count(distinct order_id)::bigint orders from delivered_items group by service_id,material_key,consumption_month
  )
  select d.service_id,d.service_name,d.material_key,d.material_id,d.item_name,d.item_sku,d.unit,m.consumption_month,m.quantity,m.amount,m.orders from monthly m join dimensions d using(service_id,material_key) order by m.consumption_month,d.service_name,d.item_name;
end;$$;
revoke all on function public.admin_consumption_analytics(date,integer,uuid) from public;
grant execute on function public.admin_consumption_analytics(date,integer,uuid) to authenticated;

create or replace function public.admin_consumption_range_bundle(p_from_date date,p_to_date date,p_service_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Acceso restringido a administradores.'; end if;
  if p_from_date is null or p_to_date is null or p_from_date>p_to_date then raise exception 'Rango de fechas inválido.'; end if;
  with delivered as (
    select o.service_id,s.name service_name,o.id order_id,coalesce(o.closed_at,o.updated_at,o.created_at) consumed_at,
      case when oi.material_id is not null then 'material:'||oi.material_id::text when nullif(btrim(coalesce(oi.item_sku,'')),'') is not null then 'sku:'||lower(btrim(oi.item_sku)) else 'custom:'||md5(lower(btrim(oi.item_name))||'|'||lower(btrim(coalesce(oi.unit,'unidad')))) end material_key,
      oi.material_id,oi.item_name,oi.item_sku,coalesce(nullif(btrim(oi.unit),''),'unidad') unit,oi.quantity,oi.line_total
    from public.orders o join public.services s on s.id=o.service_id join public.order_items oi on oi.order_id=o.id
    where o.status='entregado' and (p_service_id is null or o.service_id=p_service_id) and coalesce(o.closed_at,o.updated_at,o.created_at)::date between p_from_date and p_to_date
  ), dims as (
    select distinct on(service_id,material_key) service_id,service_name,material_key,material_id,item_name,item_sku,unit from delivered order by service_id,material_key,consumed_at desc,order_id desc
  ), services as (
    select service_id,max(service_name) service_name,count(distinct order_id)::bigint range_orders,count(distinct material_key)::bigint range_products,sum(line_total)::numeric range_amount,max(consumed_at) last_consumption_at from delivered group by service_id
  ), products as (
    select d.service_id,max(d.service_name) service_name,d.material_key,dim.material_id,dim.item_name,dim.item_sku,dim.unit,sum(d.quantity)::numeric range_quantity,sum(d.line_total)::numeric range_amount,count(distinct d.order_id)::bigint range_orders from delivered d join dims dim using(service_id,material_key) group by d.service_id,d.material_key,dim.material_id,dim.item_name,dim.item_sku,dim.unit
  ), monthly as (
    select d.service_id,max(d.service_name) service_name,d.material_key,dim.material_id,dim.item_name,dim.item_sku,dim.unit,date_trunc('month',d.consumed_at)::date consumption_month,sum(d.quantity)::numeric quantity,sum(d.line_total)::numeric amount,count(distinct d.order_id)::bigint orders from delivered d join dims dim using(service_id,material_key) group by d.service_id,d.material_key,dim.material_id,dim.item_name,dim.item_sku,dim.unit,date_trunc('month',d.consumed_at)::date
  )
  select jsonb_build_object('services',coalesce((select jsonb_agg(to_jsonb(x) order by x.range_amount desc) from services x),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(x) order by x.range_amount desc) from products x),'[]'::jsonb),'monthly',coalesce((select jsonb_agg(to_jsonb(x) order by x.consumption_month,x.service_name,x.item_name) from monthly x),'[]'::jsonb)) into result;
  return result;
end;$$;
revoke all on function public.admin_consumption_range_bundle(date,date,uuid) from public;
grant execute on function public.admin_consumption_range_bundle(date,date,uuid) to authenticated;

create or replace function public.admin_consumption_service_history(p_service_id uuid,p_months integer default 24)
returns table(consumption_month date,amount numeric,orders bigint,products bigint)
language plpgsql security definer set search_path=public as $$
declare first_month date; start_month date; end_month date;
begin
  if not public.is_admin() then raise exception 'Acceso restringido a administradores.'; end if;
  end_month:=date_trunc('month',current_date)::date;
  if coalesce(p_months,24)<=0 then
    select min(date_trunc('month',coalesce(o.closed_at,o.updated_at,o.created_at))::date) into first_month from public.orders o where o.status='entregado' and o.service_id=p_service_id;
    start_month:=coalesce(first_month,end_month);
  else
    start_month:=(end_month-make_interval(months=>greatest(1,p_months)-1))::date;
  end if;
  return query
  with months as (select generate_series(start_month,end_month,interval '1 month')::date m),
  delivered as (
    select o.id order_id,date_trunc('month',coalesce(o.closed_at,o.updated_at,o.created_at))::date m,
      case when oi.material_id is not null then 'material:'||oi.material_id::text when nullif(btrim(coalesce(oi.item_sku,'')),'') is not null then 'sku:'||lower(btrim(oi.item_sku)) else 'custom:'||md5(lower(btrim(oi.item_name))||'|'||lower(btrim(coalesce(oi.unit,'unidad')))) end material_key,oi.line_total
    from public.orders o join public.order_items oi on oi.order_id=o.id
    where o.status='entregado' and o.service_id=p_service_id and date_trunc('month',coalesce(o.closed_at,o.updated_at,o.created_at))::date between start_month and end_month
  ), agg as (select d.m,sum(d.line_total)::numeric amount,count(distinct d.order_id)::bigint orders,count(distinct d.material_key)::bigint products from delivered d group by d.m)
  select m.m,coalesce(a.amount,0)::numeric,coalesce(a.orders,0)::bigint,coalesce(a.products,0)::bigint from months m left join agg a on a.m=m.m order by m.m;
end;$$;
revoke all on function public.admin_consumption_service_history(uuid,integer) from public;
grant execute on function public.admin_consumption_service_history(uuid,integer) to authenticated;
