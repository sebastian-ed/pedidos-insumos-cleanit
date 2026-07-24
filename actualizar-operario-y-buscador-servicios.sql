begin;

-- Permite que el supervisor autenticado indique el operario responsable.
-- La identidad del supervisor sigue quedando registrada en orders.created_by mediante auth.uid().
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
begin
  if auth.uid() is null or not exists(
    select 1
    from public.profiles
    where id=auth.uid() and role='operator'
  ) then
    raise exception 'Acceso exclusivo para supervisores habilitados.';
  end if;

  if char_length(btrim(coalesce(p_reporter_name,''))) not between 2 and 100 then
    raise exception 'Ingresá el nombre del operario responsable.';
  end if;

  return public.public_create_order(
    p_service_id,
    btrim(p_reporter_name),
    p_priority,
    p_notes,
    p_items
  );
end;
$$;

revoke all on function public.supervisor_create_order(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.supervisor_create_order(uuid,text,text,text,jsonb) to authenticated;

commit;
