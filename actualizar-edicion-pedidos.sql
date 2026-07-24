-- Pedidos Clean It · actualización: edición administrativa de pedidos
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Requiere que ya esté instalada la versión con SKU, precios y control presupuestario.
-- Edición atómica del contenido de un pedido por un administrador.
-- Conserva el precio/snapshot de los renglones existentes y usa el precio actual
-- del catálogo únicamente para los insumos nuevos que se agregan.
create or replace function public.admin_replace_order_items(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
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
  v_line_total numeric(14,2);
  v_total_units numeric(14,2) := 0;
  v_total_amount numeric(14,2) := 0;
  v_count integer := 0;
  v_position integer := 0;
  v_budget_status text;
  v_previous_total numeric(14,2);
begin
  if not public.is_admin() then
    raise exception 'No tenés permisos de administrador para modificar pedidos.';
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

      v_line_total := round(v_quantity * v_existing.unit_price,2);
      v_stage := v_stage || jsonb_build_array(jsonb_build_object(
        'seq',v_position,
        'source_item_id',v_existing.id,
        'material_id',v_existing.material_id,
        'item_name',v_existing.item_name,
        'item_sku',v_existing.item_sku,
        'category',v_existing.category,
        'unit',v_existing.unit,
        'quantity',v_quantity,
        'unit_price',v_existing.unit_price,
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

      v_line_total := round(v_quantity * v_material.unit_price,2);
      v_stage := v_stage || jsonb_build_array(jsonb_build_object(
        'seq',v_position,
        'source_item_id',null,
        'material_id',v_material.id,
        'item_name',v_material.name,
        'item_sku',nullif(btrim(v_material.sku),''),
        'category',v_material.category,
        'unit',v_material.unit,
        'quantity',v_quantity,
        'unit_price',v_material.unit_price,
        'line_total',v_line_total,
        'notes',null,
        'image_url',v_material.image_url,
        'is_custom',false,
        'sort_order',v_position*10
      ));
    end if;
  end loop;

  select count(*),coalesce(sum(quantity),0),coalesce(sum(line_total),0)
  into v_count,v_total_units,v_total_amount
  from jsonb_to_recordset(v_stage) as staged(quantity numeric,line_total numeric);

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
    order_id,material_id,item_name,item_sku,category,unit,quantity,unit_price,line_total,
    notes,image_url,is_custom,sort_order
  )
  select v_order.id,staged.material_id,staged.item_name,staged.item_sku,staged.category,
         staged.unit,staged.quantity,staged.unit_price,staged.line_total,staged.notes,
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
    unit_price numeric,
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
      total_amount=v_total_amount,
      budget_status=v_budget_status
  where id=v_order.id
  returning * into v_order;

  insert into public.order_status_history(order_id,old_status,new_status,changed_by,notes)
  values(
    v_order.id,v_order.status,v_order.status,auth.uid(),
    format('Pedido editado: %s insumos, %s unidades. Total: $ %s → $ %s.',
      v_count,v_total_units,v_previous_total,v_total_amount)
  );

  return jsonb_build_object(
    'id',v_order.id,
    'order_code',v_order.order_code,
    'total_items',v_order.total_items,
    'total_units',v_order.total_units,
    'total_amount',v_order.total_amount,
    'budget_status',v_order.budget_status,
    'updated_at',v_order.updated_at
  );
end;
$$;

revoke all on function public.admin_replace_order_items(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.admin_replace_order_items(uuid,timestamptz,jsonb) to authenticated;
