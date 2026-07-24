-- LOGIN OBLIGATORIO PARA LA CARGA DE PEDIDOS
-- Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Resultado:
-- 1. Los visitantes anónimos no pueden consultar el catálogo ni crear pedidos.
-- 2. Solamente los usuarios autenticados cuyo perfil tenga role = 'operator'
--    (mostrado en la app como "Supervisor") pueden cargar pedidos.
-- 3. Administradores y proveedores continúan ingresando a sus respectivos paneles.

begin;

-- Asegura que todos los usuarios ya creados en Authentication tengan perfil.
insert into public.profiles(id,email,full_name,role)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)),
  'operator'
from auth.users
on conflict(id) do update set email=excluded.email;

-- Mantiene sincronizados los futuros usuarios creados en Authentication.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
    'operator'
  )
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- Las funciones antiguas dejan de poder ejecutarse directamente.
revoke all on function public.public_order_bootstrap() from public, anon, authenticated;
revoke all on function public.public_create_order(uuid,text,text,text,jsonb) from public, anon, authenticated;

-- Catálogo disponible únicamente para supervisores autenticados.
create or replace function public.supervisor_order_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1
    from public.profiles
    where id=auth.uid() and role='operator'
  ) then
    raise exception 'Acceso exclusivo para supervisores habilitados.';
  end if;

  return public.public_order_bootstrap();
end;
$$;

-- Alta de pedidos disponible únicamente para supervisores autenticados.
create or replace function public.supervisor_create_order(
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
  v_reporter_name text;
begin
  select left(
    coalesce(nullif(btrim(full_name),''), split_part(email,'@',1)),
    100
  )
  into v_reporter_name
  from public.profiles
  where id=auth.uid() and role='operator';

  if auth.uid() is null or v_reporter_name is null then
    raise exception 'Acceso exclusivo para supervisores habilitados.';
  end if;

  return public.public_create_order(
    p_service_id,
    v_reporter_name,
    p_priority,
    p_notes,
    p_items
  );
end;
$$;

revoke all on function public.supervisor_order_bootstrap() from public, anon, authenticated;
revoke all on function public.supervisor_create_order(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.supervisor_order_bootstrap() to authenticated;
grant execute on function public.supervisor_create_order(uuid,text,text,text,jsonb) to authenticated;

commit;
