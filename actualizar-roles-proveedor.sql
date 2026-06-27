-- Pedidos Clean It · actualización: roles y acceso para proveedor
-- Ejecutar una sola vez en Supabase > SQL Editor sobre el proyecto existente.
-- No elimina pedidos, servicios, materiales, imágenes ni configuraciones existentes.

begin;

-- 1) Ampliar roles disponibles.
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles
set role='operator'
where role is null or role not in('admin','supplier','operator');

alter table public.profiles
  add constraint profiles_role_check
  check(role in('admin','supplier','operator'));

-- 2) Funciones de permisos.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles
    where id=auth.uid() and role='admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles
    where id=auth.uid() and role in('admin','supplier')
  );
$$;

-- 3) RPC segura para que administración y proveedor cambien sólo estados.
create or replace function public.staff_update_order_status(
  p_order_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_staff() then
    raise exception 'No tenés permisos para cambiar estados de pedidos.';
  end if;

  if p_status not in('pendiente','preparacion','enviado','entregado','cancelado') then
    raise exception 'El estado indicado no es válido.';
  end if;

  update public.orders
  set status=p_status
  where id=p_order_id
  returning * into v_order;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if p_notes is not null and btrim(p_notes) <> '' then
    insert into public.order_status_history(order_id,old_status,new_status,changed_by,notes)
    values(v_order.id,null,v_order.status,auth.uid(),left(btrim(p_notes),300));
  end if;

  return jsonb_build_object(
    'id',v_order.id,
    'order_code',v_order.order_code,
    'status',v_order.status,
    'updated_at',v_order.updated_at,
    'closed_at',v_order.closed_at
  );
end;
$$;

-- 4) Rehacer políticas RLS con lectura operativa para proveedor y escritura total sólo para admin.
drop policy if exists services_admin_read on public.services;
drop policy if exists services_admin_write on public.services;
drop policy if exists services_staff_read on public.services;
drop policy if exists services_admin_all on public.services;

create policy services_staff_read
  on public.services for select to authenticated
  using(public.is_staff());

create policy services_admin_all
  on public.services for all to authenticated
  using(public.is_admin())
  with check(public.is_admin());


drop policy if exists materials_admin_read on public.materials;
drop policy if exists materials_admin_write on public.materials;
drop policy if exists materials_staff_read on public.materials;
drop policy if exists materials_admin_all on public.materials;

create policy materials_staff_read
  on public.materials for select to authenticated
  using(public.is_staff());

create policy materials_admin_all
  on public.materials for all to authenticated
  using(public.is_admin())
  with check(public.is_admin());


drop policy if exists service_material_exclusions_admin_all on public.service_material_exclusions;
drop policy if exists service_material_exclusions_staff_read on public.service_material_exclusions;
drop policy if exists service_material_exclusions_admin_all_v2 on public.service_material_exclusions;

create policy service_material_exclusions_staff_read
  on public.service_material_exclusions for select to authenticated
  using(public.is_staff());

create policy service_material_exclusions_admin_all_v2
  on public.service_material_exclusions for all to authenticated
  using(public.is_admin())
  with check(public.is_admin());


drop policy if exists profiles_self_admin_read on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_staff_read on public.profiles;
drop policy if exists profiles_admin_update_v2 on public.profiles;

create policy profiles_staff_read
  on public.profiles for select to authenticated
  using(id=auth.uid() or public.is_staff());

create policy profiles_admin_update_v2
  on public.profiles for update to authenticated
  using(public.is_admin())
  with check(public.is_admin());


drop policy if exists orders_admin_all on public.orders;
drop policy if exists orders_staff_read on public.orders;
drop policy if exists orders_admin_all_v2 on public.orders;

create policy orders_staff_read
  on public.orders for select to authenticated
  using(public.is_staff());

create policy orders_admin_all_v2
  on public.orders for all to authenticated
  using(public.is_admin())
  with check(public.is_admin());


drop policy if exists order_items_admin_all on public.order_items;
drop policy if exists order_items_staff_read on public.order_items;
drop policy if exists order_items_admin_all_v2 on public.order_items;

create policy order_items_staff_read
  on public.order_items for select to authenticated
  using(public.is_staff());

create policy order_items_admin_all_v2
  on public.order_items for all to authenticated
  using(public.is_admin())
  with check(public.is_admin());


drop policy if exists order_history_admin_read on public.order_status_history;
drop policy if exists order_history_staff_read on public.order_status_history;

create policy order_history_staff_read
  on public.order_status_history for select to authenticated
  using(public.is_staff());

-- 5) Grants. La seguridad real queda en RLS y en las funciones.
revoke all on function public.staff_update_order_status(uuid,text,text) from public;
grant execute on function public.staff_update_order_status(uuid,text,text) to authenticated;

grant select,insert,update,delete on public.services, public.materials, public.service_material_exclusions, public.profiles, public.orders, public.order_items, public.order_status_history to authenticated;

commit;

select
  count(*) filter (where role='admin') as administradores,
  count(*) filter (where role='supplier') as proveedores,
  count(*) filter (where role='operator') as operadores_especiales
from public.profiles;
