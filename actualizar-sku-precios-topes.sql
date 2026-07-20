-- Pedidos Clean It · actualización v5: SKU, precios y topes presupuestarios
-- Ejecutar una sola vez en Supabase > SQL Editor sobre el proyecto que ya está funcionando.
-- No elimina pedidos, servicios, materiales, imágenes ni configuraciones existentes.

begin;

-- 0) Compatibilidad: asegura que exista la configuración de insumos ocultos por servicio.
create table if not exists public.service_material_exclusions(
  service_id uuid not null references public.services(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(service_id,material_id)
);

create index if not exists idx_service_material_exclusions_material
  on public.service_material_exclusions(material_id);

alter table public.service_material_exclusions enable row level security;
drop policy if exists service_material_exclusions_admin_all on public.service_material_exclusions;
drop policy if exists service_material_exclusions_staff_read on public.service_material_exclusions;
drop policy if exists service_material_exclusions_admin_all_v2 on public.service_material_exclusions;
create policy service_material_exclusions_staff_read
  on public.service_material_exclusions for select to authenticated
  using(public.is_staff());
create policy service_material_exclusions_admin_all_v2
  on public.service_material_exclusions for all to authenticated
  using(public.is_admin()) with check(public.is_admin());

revoke all on public.service_material_exclusions from anon;
grant select,insert,update,delete on public.service_material_exclusions to authenticated;

-- 1) Datos económicos de servicios.
alter table public.services
  add column if not exists monthly_billing numeric(14,2) not null default 0,
  add column if not exists budget_limit_percent numeric(5,2) not null default 5;

alter table public.services drop constraint if exists services_monthly_billing_check;
alter table public.services add constraint services_monthly_billing_check check(monthly_billing >= 0);
alter table public.services drop constraint if exists services_budget_limit_percent_check;
alter table public.services add constraint services_budget_limit_percent_check check(budget_limit_percent between 5 and 7);

-- 2) SKU y precio del catálogo.
alter table public.materials
  add column if not exists sku text,
  add column if not exists unit_price numeric(14,2) not null default 0;

update public.materials set sku=null where sku is not null and btrim(sku)='';
alter table public.materials drop constraint if exists materials_unit_price_check;
alter table public.materials add constraint materials_unit_price_check check(unit_price >= 0);
create unique index if not exists idx_materials_sku_unique
  on public.materials(lower(sku))
  where sku is not null and btrim(sku) <> '';

-- 3) Totales y fotografía presupuestaria del pedido.
alter table public.orders
  add column if not exists total_amount numeric(14,2) not null default 0,
  add column if not exists monthly_billing_snapshot numeric(14,2) not null default 0,
  add column if not exists budget_limit_percent_snapshot numeric(5,2) not null default 5,
  add column if not exists budget_limit_amount_snapshot numeric(14,2) not null default 0,
  add column if not exists budget_five_percent_snapshot numeric(14,2) not null default 0,
  add column if not exists budget_seven_percent_snapshot numeric(14,2) not null default 0,
  add column if not exists budget_status text not null default 'sin_configurar';

alter table public.orders drop constraint if exists orders_total_amount_check;
alter table public.orders add constraint orders_total_amount_check check(total_amount >= 0);
alter table public.orders drop constraint if exists orders_monthly_billing_snapshot_check;
alter table public.orders add constraint orders_monthly_billing_snapshot_check check(monthly_billing_snapshot >= 0);
alter table public.orders drop constraint if exists orders_budget_limit_percent_snapshot_check;
alter table public.orders add constraint orders_budget_limit_percent_snapshot_check check(budget_limit_percent_snapshot between 5 and 7);
alter table public.orders drop constraint if exists orders_budget_limit_amount_snapshot_check;
alter table public.orders add constraint orders_budget_limit_amount_snapshot_check check(budget_limit_amount_snapshot >= 0);
alter table public.orders drop constraint if exists orders_budget_five_percent_snapshot_check;
alter table public.orders add constraint orders_budget_five_percent_snapshot_check check(budget_five_percent_snapshot >= 0);
alter table public.orders drop constraint if exists orders_budget_seven_percent_snapshot_check;
alter table public.orders add constraint orders_budget_seven_percent_snapshot_check check(budget_seven_percent_snapshot >= 0);
alter table public.orders drop constraint if exists orders_budget_status_check;
alter table public.orders add constraint orders_budget_status_check check(budget_status in('sin_configurar','dentro','sobre_limite','sobre_7'));

-- 4) Precio y SKU congelados por renglón.
alter table public.order_items
  add column if not exists item_sku text,
  add column if not exists unit_price numeric(14,2) not null default 0,
  add column if not exists line_total numeric(14,2) not null default 0;

alter table public.order_items drop constraint if exists order_items_unit_price_check;
alter table public.order_items add constraint order_items_unit_price_check check(unit_price >= 0);
alter table public.order_items drop constraint if exists order_items_line_total_check;
alter table public.order_items add constraint order_items_line_total_check check(line_total >= 0);

-- Los pedidos históricos quedan con valores 0 porque no existía precio congelado al momento de crearlos.
update public.orders set budget_status='sin_configurar' where monthly_billing_snapshot <= 0;

-- 5) Bootstrap público con datos económicos necesarios para el carrito.
create or replace function public.public_order_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.name)
      from (
        select id,name,address,description,zone,supervisor,monthly_billing,budget_limit_percent,active
        from public.services
        where active=true
      ) s
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.category,m.sort_order,m.name)
      from (
        select id,slug,name,sku,category,detail,unit,image_url,suggested_quantity,unit_price,sort_order,active
        from public.materials
        where active=true
      ) m
    ), '[]'::jsonb),
    'hidden_materials', coalesce((
      select jsonb_agg(jsonb_build_object('service_id',x.service_id,'material_id',x.material_id))
      from public.service_material_exclusions x
      join public.services s on s.id=x.service_id and s.active=true
      join public.materials m on m.id=x.material_id and m.active=true
    ), '[]'::jsonb)
  );
$$;

-- 6) Alta pública: precios del catálogo se toman del servidor, no del navegador.
create or replace function public.public_create_order(
  p_service_id uuid,
  p_reporter_name text,
  p_priority text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_service public.services%rowtype;
  v_item jsonb;
  v_material public.materials%rowtype;
  v_material_id uuid;
  v_quantity numeric(12,2);
  v_custom_name text;
  v_custom_sku text;
  v_unit text;
  v_item_notes text;
  v_unit_price numeric(14,2);
  v_line_total numeric(14,2);
  v_count integer := 0;
  v_total_units numeric(14,2) := 0;
  v_total_amount numeric(14,2) := 0;
  v_limit_amount numeric(14,2) := 0;
  v_five_amount numeric(14,2) := 0;
  v_seven_amount numeric(14,2) := 0;
  v_budget_status text := 'sin_configurar';
begin
  select * into v_service from public.services where id=p_service_id and active=true;
  if not found then raise exception 'El servicio seleccionado no existe o está inactivo.'; end if;
  if char_length(btrim(coalesce(p_reporter_name,''))) not between 2 and 100 then raise exception 'Ingresá un nombre válido.'; end if;
  if coalesce(p_priority,'normal') not in ('normal','urgente') then raise exception 'La prioridad no es válida.'; end if;
  if p_notes is not null and char_length(p_notes) > 500 then raise exception 'La observación general es demasiado extensa.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'El pedido debe incluir al menos un insumo.'; end if;
  if jsonb_array_length(p_items) > 80 then raise exception 'El pedido supera el máximo de 80 ítems.'; end if;

  v_five_amount := round(v_service.monthly_billing * 0.05, 2);
  v_seven_amount := round(v_service.monthly_billing * 0.07, 2);
  v_limit_amount := round(v_service.monthly_billing * v_service.budget_limit_percent / 100, 2);

  insert into public.orders(
    service_id,reporter_name,priority,notes,created_by,
    monthly_billing_snapshot,budget_limit_percent_snapshot,budget_limit_amount_snapshot,
    budget_five_percent_snapshot,budget_seven_percent_snapshot
  ) values(
    p_service_id,btrim(p_reporter_name),coalesce(p_priority,'normal'),nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),
    v_service.monthly_billing,v_service.budget_limit_percent,v_limit_amount,v_five_amount,v_seven_amount
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin v_quantity := nullif(v_item->>'quantity','')::numeric;
    exception when invalid_text_representation then raise exception 'Una de las cantidades no es válida.'; end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999 then raise exception 'Una de las cantidades no es válida.'; end if;

    v_material_id := null;
    if nullif(v_item->>'material_id','') is not null then
      begin v_material_id := (v_item->>'material_id')::uuid;
      exception when invalid_text_representation then raise exception 'Uno de los insumos no es válido.'; end;
    end if;

    if v_material_id is not null then
      select * into v_material from public.materials where id=v_material_id and active=true;
      if not found then raise exception 'Uno de los insumos ya no está disponible.'; end if;
      if exists(select 1 from public.service_material_exclusions where service_id=p_service_id and material_id=v_material_id) then
        raise exception 'Uno de los insumos no está habilitado para este servicio.';
      end if;
      v_unit_price := v_material.unit_price;
      v_line_total := round(v_quantity * v_unit_price, 2);
      insert into public.order_items(order_id,material_id,item_name,item_sku,category,unit,quantity,unit_price,line_total,notes,image_url,is_custom,sort_order)
      values(v_order.id,v_material.id,v_material.name,nullif(btrim(v_material.sku),''),v_material.category,v_material.unit,v_quantity,v_unit_price,v_line_total,null,v_material.image_url,false,v_material.sort_order);
    else
      v_custom_name := btrim(coalesce(v_item->>'custom_name',''));
      v_custom_sku := nullif(btrim(coalesce(v_item->>'sku','')),'');
      v_unit := btrim(coalesce(v_item->>'unit','unidad'));
      v_item_notes := nullif(btrim(coalesce(v_item->>'notes','')),'');
      begin v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric,0);
      exception when invalid_text_representation then raise exception 'El precio del insumo no listado no es válido.'; end;
      if char_length(v_custom_name) not between 2 and 120 then raise exception 'El nombre del insumo no listado no es válido.'; end if;
      if v_custom_sku is not null and char_length(v_custom_sku) > 80 then raise exception 'El SKU del insumo no listado es demasiado extenso.'; end if;
      if char_length(v_unit) not between 1 and 60 then raise exception 'La unidad del insumo no listado no es válida.'; end if;
      if v_unit_price < 0 or v_unit_price > 999999999.99 then raise exception 'El precio del insumo no listado no es válido.'; end if;
      if v_item_notes is not null and char_length(v_item_notes) > 300 then raise exception 'El detalle del insumo no listado es demasiado extenso.'; end if;
      v_line_total := round(v_quantity * v_unit_price, 2);
      insert into public.order_items(order_id,material_id,item_name,item_sku,category,unit,quantity,unit_price,line_total,notes,image_url,is_custom,sort_order)
      values(v_order.id,null,v_custom_name,v_custom_sku,'Excepción',v_unit,v_quantity,v_unit_price,v_line_total,v_item_notes,'assets/materials/default.svg',true,9999);
    end if;

    v_count := v_count + 1;
    v_total_units := v_total_units + v_quantity;
    v_total_amount := v_total_amount + v_line_total;
  end loop;

  if v_service.monthly_billing <= 0 then v_budget_status := 'sin_configurar';
  elsif v_total_amount > v_seven_amount then v_budget_status := 'sobre_7';
  elsif v_total_amount > v_limit_amount then v_budget_status := 'sobre_limite';
  else v_budget_status := 'dentro'; end if;

  update public.orders
  set total_items=v_count,total_units=v_total_units,total_amount=v_total_amount,budget_status=v_budget_status
  where id=v_order.id returning * into v_order;

  return jsonb_build_object(
    'id',v_order.id,'order_code',v_order.order_code,'created_at',v_order.created_at,
    'item_count',v_order.total_items,'total_units',v_order.total_units,'total_amount',v_order.total_amount,
    'monthly_billing',v_order.monthly_billing_snapshot,'budget_limit_percent',v_order.budget_limit_percent_snapshot,
    'budget_limit_amount',v_order.budget_limit_amount_snapshot,'budget_five_amount',v_order.budget_five_percent_snapshot,
    'budget_seven_amount',v_order.budget_seven_percent_snapshot,'budget_status',v_order.budget_status
  );
end;
$$;

-- 7) Mantiene disponible la administración de insumos ocultos por servicio.
create or replace function public.admin_set_service_hidden_materials(
  p_service_id uuid,
  p_hidden_material_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then raise exception 'No tenés permisos de administrador.'; end if;
  if not exists(select 1 from public.services where id=p_service_id) then raise exception 'El servicio no existe.'; end if;

  delete from public.service_material_exclusions where service_id=p_service_id;
  insert into public.service_material_exclusions(service_id,material_id)
  select p_service_id,m.id
  from public.materials m
  where m.id=any(coalesce(p_hidden_material_ids,array[]::uuid[]))
  on conflict(service_id,material_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.public_order_bootstrap() to anon,authenticated;
grant execute on function public.public_create_order(uuid,text,text,text,jsonb) to anon,authenticated;
revoke all on function public.admin_set_service_hidden_materials(uuid,uuid[]) from public;
grant execute on function public.admin_set_service_hidden_materials(uuid,uuid[]) to authenticated;

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='service_material_exclusions'
  ) then
    alter publication supabase_realtime add table public.service_material_exclusions;
  end if;
end;
$$;

commit;

select
  (select count(*) from public.materials where sku is not null) as insumos_con_sku,
  (select count(*) from public.materials where unit_price > 0) as insumos_con_precio,
  (select count(*) from public.services where monthly_billing > 0) as servicios_con_facturacion;
