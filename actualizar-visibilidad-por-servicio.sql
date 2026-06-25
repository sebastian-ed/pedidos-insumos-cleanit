-- Pedidos Clean It · actualización: visibilidad de insumos por servicio
-- Ejecutar una sola vez en Supabase > SQL Editor sobre el proyecto que ya está funcionando.
-- No elimina pedidos, servicios, materiales, imágenes ni configuraciones existentes.

begin;

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
create policy service_material_exclusions_admin_all
  on public.service_material_exclusions
  for all to authenticated
  using(public.is_admin())
  with check(public.is_admin());

revoke all on public.service_material_exclusions from anon;
grant select,insert,update,delete on public.service_material_exclusions to authenticated;

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
        select id,name,address,description,zone,supervisor,active
        from public.services
        where active=true
      ) s
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.category,m.sort_order,m.name)
      from (
        select id,slug,name,category,detail,unit,image_url,suggested_quantity,sort_order,active
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
  v_item jsonb;
  v_material public.materials%rowtype;
  v_material_id uuid;
  v_quantity numeric(12,2);
  v_custom_name text;
  v_unit text;
  v_item_notes text;
  v_count integer := 0;
  v_total numeric(14,2) := 0;
begin
  if not exists(select 1 from public.services where id=p_service_id and active=true) then
    raise exception 'El servicio seleccionado no existe o está inactivo.';
  end if;

  if char_length(btrim(coalesce(p_reporter_name,''))) not between 2 and 100 then
    raise exception 'Ingresá un nombre válido.';
  end if;

  if coalesce(p_priority,'normal') not in ('normal','urgente') then
    raise exception 'La prioridad no es válida.';
  end if;

  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception 'La observación general es demasiado extensa.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'El pedido debe incluir al menos un insumo.';
  end if;

  if jsonb_array_length(p_items) > 80 then
    raise exception 'El pedido supera el máximo de 80 ítems.';
  end if;

  insert into public.orders(service_id,reporter_name,priority,notes,created_by)
  values(p_service_id,btrim(p_reporter_name),coalesce(p_priority,'normal'),nullif(btrim(coalesce(p_notes,'')),''),auth.uid())
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := nullif(v_item->>'quantity','')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999 then
      raise exception 'Una de las cantidades no es válida.';
    end if;

    v_material_id := null;
    if nullif(v_item->>'material_id','') is not null then
      begin
        v_material_id := (v_item->>'material_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Uno de los insumos no es válido.';
      end;
    end if;

    if v_material_id is not null then
      select * into v_material from public.materials where id=v_material_id and active=true;
      if not found then
        raise exception 'Uno de los insumos ya no está disponible.';
      end if;

      if exists(
        select 1 from public.service_material_exclusions
        where service_id=p_service_id and material_id=v_material_id
      ) then
        raise exception 'Uno de los insumos no está habilitado para este servicio.';
      end if;

      insert into public.order_items(order_id,material_id,item_name,category,unit,quantity,notes,image_url,is_custom,sort_order)
      values(v_order.id,v_material.id,v_material.name,v_material.category,v_material.unit,v_quantity,null,v_material.image_url,false,v_material.sort_order);
    else
      v_custom_name := btrim(coalesce(v_item->>'custom_name',''));
      v_unit := btrim(coalesce(v_item->>'unit','unidad'));
      v_item_notes := nullif(btrim(coalesce(v_item->>'notes','')), '');

      if char_length(v_custom_name) not between 2 and 120 then
        raise exception 'El nombre del insumo no listado no es válido.';
      end if;
      if char_length(v_unit) not between 1 and 60 then
        raise exception 'La unidad del insumo no listado no es válida.';
      end if;
      if v_item_notes is not null and char_length(v_item_notes) > 300 then
        raise exception 'El detalle del insumo no listado es demasiado extenso.';
      end if;

      insert into public.order_items(order_id,material_id,item_name,category,unit,quantity,notes,image_url,is_custom,sort_order)
      values(v_order.id,null,v_custom_name,'Excepción',v_unit,v_quantity,v_item_notes,'assets/materials/default.svg',true,9999);
    end if;

    v_count := v_count + 1;
    v_total := v_total + v_quantity;
  end loop;

  update public.orders
  set total_items=v_count,total_units=v_total
  where id=v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'id',v_order.id,
    'order_code',v_order.order_code,
    'created_at',v_order.created_at,
    'item_count',v_order.total_items,
    'total_units',v_order.total_units
  );
end;
$$;

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
  if not public.is_admin() then
    raise exception 'No tenés permisos de administrador.';
  end if;
  if not exists(select 1 from public.services where id=p_service_id) then
    raise exception 'El servicio no existe.';
  end if;

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
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='service_material_exclusions'
  ) then
    alter publication supabase_realtime add table public.service_material_exclusions;
  end if;
end;
$$;

commit;

select
  (select count(*) from public.services) as servicios,
  (select count(*) from public.materials where active=true) as insumos_activos,
  (select count(*) from public.service_material_exclusions) as exclusiones_iniciales;
