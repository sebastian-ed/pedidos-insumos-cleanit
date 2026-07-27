-- Pedidos Clean It · retiro en Naón y descuento del 7%
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Requiere las actualizaciones anteriores de login, operario/buscador y edición de pedidos.

begin;

-- El pedido conserva tanto el importe de lista como el importe final.
alter table public.orders add column if not exists pickup_at_naon boolean;
alter table public.orders add column if not exists discount_percent_snapshot numeric(5,2) not null default 0;
alter table public.orders add column if not exists gross_total_amount numeric(14,2) not null default 0;
alter table public.orders add column if not exists discount_amount numeric(14,2) not null default 0;

alter table public.order_items add column if not exists list_unit_price numeric(14,2);
alter table public.order_items add column if not exists discount_percent numeric(5,2) not null default 0;

-- Los pedidos anteriores no tenían descuento. Se toma su precio vigente como precio de lista.
update public.order_items
set list_unit_price=unit_price
where list_unit_price is null;

alter table public.order_items alter column list_unit_price set not null;

update public.orders
set gross_total_amount=total_amount,
    discount_amount=0,
    discount_percent_snapshot=0
where pickup_at_naon is null;

alter table public.orders drop constraint if exists orders_discount_percent_snapshot_check;
alter table public.orders add constraint orders_discount_percent_snapshot_check
  check(discount_percent_snapshot between 0 and 100);
alter table public.orders drop constraint if exists orders_gross_total_amount_check;
alter table public.orders add constraint orders_gross_total_amount_check
  check(gross_total_amount >= 0);
alter table public.orders drop constraint if exists orders_discount_amount_check;
alter table public.orders add constraint orders_discount_amount_check
  check(discount_amount >= 0);
alter table public.order_items drop constraint if exists order_items_list_unit_price_check;
alter table public.order_items add constraint order_items_list_unit_price_check
  check(list_unit_price >= 0);
alter table public.order_items drop constraint if exists order_items_discount_percent_check;
alter table public.order_items add constraint order_items_discount_percent_check
  check(discount_percent between 0 and 100);

-- Mantiene compatibles los pedidos que siguen creando los supervisores.
create or replace function public.sync_order_pricing_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.pickup_at_naon is null or new.pickup_at_naon=false then
    new.discount_percent_snapshot := 0;
    new.gross_total_amount := new.total_amount;
    new.discount_amount := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_pricing_defaults on public.orders;
create trigger orders_sync_pricing_defaults
before insert or update of total_amount,pickup_at_naon,discount_percent_snapshot,gross_total_amount,discount_amount
on public.orders
for each row execute function public.sync_order_pricing_defaults();

create or replace function public.sync_order_item_pricing_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.list_unit_price is null then
    new.list_unit_price := new.unit_price;
  end if;
  if new.discount_percent is null then
    new.discount_percent := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_sync_pricing_defaults on public.order_items;
create trigger order_items_sync_pricing_defaults
before insert or update of unit_price,list_unit_price,discount_percent
on public.order_items
for each row execute function public.sync_order_item_pricing_defaults();

-- Se reemplaza la función anterior porque ahora también guarda la modalidad de entrega.
drop function if exists public.admin_replace_order_items(uuid,timestamptz,jsonb,boolean);
drop function if exists public.admin_replace_order_items(uuid,timestamptz,jsonb);

create function public.admin_replace_order_items(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb,
  p_pickup_at_naon boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_items%rowtype;
  v_material public.materials%rowtype;
  v_item jsonb;
  v_stage jsonb := '[]'::jsonb;
  v_source_item_id uuid;
  v_material_id uuid;
  v_quantity numeric(12,2);
  v_list_unit_price numeric(14,2);
  v_effective_unit_price numeric(14,2);
  v_discount_percent numeric(5,2);
  v_gross_line_total numeric(14,2);
  v_line_total numeric(14,2);
  v_total_units numeric(14,2) := 0;
  v_gross_total_amount numeric(14,2) := 0;
  v_total_amount numeric(14,2) := 0;
  v_discount_amount numeric(14,2) := 0;
  v_count integer := 0;
  v_position integer := 0;
  v_budget_status text;
  v_previous_total numeric(14,2);
  v_mode_text text;
begin
  if not public.is_admin() then
    raise exception 'No tenés permisos de administrador para modificar pedidos.';
  end if;

  if p_pickup_at_naon is null then
    raise exception 'Definí si el pedido se retira en Naón o se entrega en el servicio.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'El pedido debe incluir al menos un insumo.';
  end if;
  if jsonb_array_length(p_items) > 80 then
    raise exception 'El pedido supera el máximo de 80 ítems.';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_order.status in ('entregado','cancelado') then
    raise exception 'El pedido está cerrado. Reabrilo antes de modificar sus insumos.';
  end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido fue modificado por otro usuario. Actualizá los datos antes de guardar.';
  end if;

  v_previous_total := v_order.total_amount;
  v_discount_percent := case when p_pickup_at_naon then 7 else 0 end;
  v_mode_text := case when p_pickup_at_naon then 'Retiro en Naón (7% de descuento)' else 'Entrega directa al servicio (sin descuento)' end;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;

    begin
      v_quantity := nullif(v_item->>'quantity','')::numeric;
    exception when invalid_text_representation then
      raise exception 'Una de las cantidades no es válida.';
    end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999 then
      raise exception 'Una de las cantidades no es válida.';
    end if;

    v_source_item_id := null;
    if nullif(v_item->>'source_item_id','') is not null then
      begin
        v_source_item_id := (v_item->>'source_item_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Uno de los renglones originales no es válido.';
      end;
    end if;

    if v_source_item_id is not null then
      if exists(select 1 from jsonb_array_elements(v_stage) staged where staged->>'source_item_id'=v_source_item_id::text) then
        raise exception 'Un renglón del pedido está duplicado.';
      end if;

      select * into v_existing
      from public.order_items
      where id=v_source_item_id and order_id=v_order.id;

      if not found then
        raise exception 'Uno de los renglones originales ya no existe. Actualizá el pedido.';
      end if;

      if v_existing.material_id is not null and exists(
        select 1 from jsonb_array_elements(v_stage) staged
        where staged->>'material_id'=v_existing.material_id::text
      ) then
        raise exception 'Un mismo insumo no puede aparecer dos veces en el pedido.';
      end if;

      v_list_unit_price := coalesce(v_existing.list_unit_price,v_existing.unit_price);
      v_effective_unit_price := round(v_list_unit_price * (1 - v_discount_percent / 100),2);
      v_gross_line_total := round(v_quantity * v_list_unit_price,2);
      v_line_total := round(v_quantity * v_effective_unit_price,2);

      v_stage := v_stage || jsonb_build_array(jsonb_build_object(
        'seq',v_position,
        'source_item_id',v_existing.id,
        'material_id',v_existing.material_id,
        'item_name',v_existing.item_name,
        'item_sku',v_existing.item_sku,
        'category',v_existing.category,
        'unit',v_existing.unit,
        'quantity',v_quantity,
        'list_unit_price',v_list_unit_price,
        'discount_percent',v_discount_percent,
        'unit_price',v_effective_unit_price,
        'gross_line_total',v_gross_line_total,
        'line_total',v_line_total,
        'notes',v_existing.notes,
        'image_url',v_existing.image_url,
        'is_custom',v_existing.is_custom,
        'sort_order',v_position*10
      ));
    else
      v_material_id := null;
      if nullif(v_item->>'material_id','') is not null then
        begin
          v_material_id := (v_item->>'material_id')::uuid;
        exception when invalid_text_representation then
          raise exception 'Uno de los insumos nuevos no es válido.';
        end;
      end if;
      if v_material_id is null then
        raise exception 'No se puede incorporar un insumo sin identificar.';
      end if;
      if exists(
        select 1 from jsonb_array_elements(v_stage) staged
        where staged->>'material_id'=v_material_id::text
      ) then
        raise exception 'Un mismo insumo no puede aparecer dos veces en el pedido.';
      end if;

      select * into v_material
      from public.materials
      where id=v_material_id and active=true;

      if not found then
        raise exception 'Uno de los insumos nuevos ya no está disponible.';
      end if;
      if exists(
        select 1 from public.service_material_exclusions
        where service_id=v_order.service_id and material_id=v_material_id
      ) then
        raise exception 'Uno de los insumos nuevos no está habilitado para este servicio.';
      end if;

      v_list_unit_price := v_material.unit_price;
      v_effective_unit_price := round(v_list_unit_price * (1 - v_discount_percent / 100),2);
      v_gross_line_total := round(v_quantity * v_list_unit_price,2);
      v_line_total := round(v_quantity * v_effective_unit_price,2);

      v_stage := v_stage || jsonb_build_array(jsonb_build_object(
        'seq',v_position,
        'source_item_id',null,
        'material_id',v_material.id,
        'item_name',v_material.name,
        'item_sku',nullif(btrim(v_material.sku),''),
        'category',v_material.category,
        'unit',v_material.unit,
        'quantity',v_quantity,
        'list_unit_price',v_list_unit_price,
        'discount_percent',v_discount_percent,
        'unit_price',v_effective_unit_price,
        'gross_line_total',v_gross_line_total,
        'line_total',v_line_total,
        'notes',null,
        'image_url',v_material.image_url,
        'is_custom',false,
        'sort_order',v_position*10
      ));
    end if;
  end loop;

  select count(*),coalesce(sum(quantity),0),coalesce(sum(gross_line_total),0),coalesce(sum(line_total),0)
  into v_count,v_total_units,v_gross_total_amount,v_total_amount
  from jsonb_to_recordset(v_stage) as staged(quantity numeric,gross_line_total numeric,line_total numeric);

  v_discount_amount := round(greatest(0,v_gross_total_amount-v_total_amount),2);

  if v_order.monthly_billing_snapshot <= 0 then
    v_budget_status := 'sin_configurar';
  elsif v_total_amount > v_order.budget_seven_percent_snapshot then
    v_budget_status := 'sobre_7';
  elsif v_total_amount > v_order.budget_limit_amount_snapshot then
    v_budget_status := 'sobre_limite';
  else
    v_budget_status := 'dentro';
  end if;

  delete from public.order_items where order_id=v_order.id;

  insert into public.order_items(
    order_id,material_id,item_name,item_sku,category,unit,quantity,
    list_unit_price,discount_percent,unit_price,line_total,
    notes,image_url,is_custom,sort_order
  )
  select v_order.id,staged.material_id,staged.item_name,staged.item_sku,staged.category,
         staged.unit,staged.quantity,staged.list_unit_price,staged.discount_percent,
         staged.unit_price,staged.line_total,staged.notes,
         staged.image_url,staged.is_custom,staged.sort_order
  from jsonb_to_recordset(v_stage) as staged(
    seq integer,
    source_item_id uuid,
    material_id uuid,
    item_name text,
    item_sku text,
    category text,
    unit text,
    quantity numeric,
    list_unit_price numeric,
    discount_percent numeric,
    unit_price numeric,
    gross_line_total numeric,
    line_total numeric,
    notes text,
    image_url text,
    is_custom boolean,
    sort_order integer
  )
  order by staged.seq;

  update public.orders
  set total_items=v_count,
      total_units=v_total_units,
      pickup_at_naon=p_pickup_at_naon,
      discount_percent_snapshot=v_discount_percent,
      gross_total_amount=v_gross_total_amount,
      discount_amount=v_discount_amount,
      total_amount=v_total_amount,
      budget_status=v_budget_status
  where id=v_order.id
  returning * into v_order;

  insert into public.order_status_history(order_id,old_status,new_status,changed_by,notes)
  values(
    v_order.id,v_order.status,v_order.status,auth.uid(),
    format('Pedido editado. %s. %s insumos, %s unidades. Subtotal: $ %s. Descuento: $ %s. Total: $ %s → $ %s.',
      v_mode_text,v_count,v_total_units,v_gross_total_amount,v_discount_amount,v_previous_total,v_total_amount)
  );

  return jsonb_build_object(
    'id',v_order.id,
    'order_code',v_order.order_code,
    'total_items',v_order.total_items,
    'total_units',v_order.total_units,
    'pickup_at_naon',v_order.pickup_at_naon,
    'discount_percent',v_order.discount_percent_snapshot,
    'gross_total_amount',v_order.gross_total_amount,
    'discount_amount',v_order.discount_amount,
    'total_amount',v_order.total_amount,
    'budget_status',v_order.budget_status,
    'updated_at',v_order.updated_at
  );
end;
$$;

revoke all on function public.admin_replace_order_items(uuid,timestamptz,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_replace_order_items(uuid,timestamptz,jsonb,boolean) to authenticated;

-- Fuerza a PostgREST/Supabase a refrescar la firma de la función.
notify pgrst, 'reload schema';

commit;
