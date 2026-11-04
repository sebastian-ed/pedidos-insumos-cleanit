-- FIX: persistencia de insumos visibles/ocultos por servicio
-- Ejecutar una vez en Supabase > SQL Editor.
-- No borra pedidos, materiales ni servicios.

create or replace function public.admin_set_service_hidden_materials(
  p_service_id uuid,
  p_hidden_material_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Solo un administrador puede configurar insumos por servicio.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.services s where s.id = p_service_id) then
    raise exception 'El servicio indicado no existe.' using errcode = 'P0002';
  end if;

  delete from public.service_material_exclusions
  where service_id = p_service_id;

  insert into public.service_material_exclusions (service_id, material_id)
  select p_service_id, x.material_id
  from (
    select distinct unnest(coalesce(p_hidden_material_ids, '{}'::uuid[])) as material_id
  ) x
  join public.materials m on m.id = x.material_id;
end;
$$;

revoke all on function public.admin_set_service_hidden_materials(uuid, uuid[]) from public;
grant execute on function public.admin_set_service_hidden_materials(uuid, uuid[]) to authenticated;

-- Verificación opcional: debe devolver la función con argumentos uuid, uuid[].
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'admin_set_service_hidden_materials';
