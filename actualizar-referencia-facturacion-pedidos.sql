-- Clean It · Referencia presupuestaria de pedidos existentes
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Permite detectar cuando la facturación de un servicio cambió después de crear un pedido
-- y registrar si Operaciones decide conservar la referencia anterior o usar la actual.

alter table public.orders
  add column if not exists billing_reference_decision text,
  add column if not exists billing_reference_reviewed_service_billing numeric(14,2),
  add column if not exists billing_reference_reviewed_limit_percent numeric(5,2),
  add column if not exists billing_reference_reviewed_at timestamptz,
  add column if not exists billing_reference_reviewed_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='orders_billing_reference_decision_check'
      and conrelid='public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_billing_reference_decision_check
      check (billing_reference_decision is null or billing_reference_decision in ('previous','current'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='orders_billing_reference_reviewed_service_billing_check'
      and conrelid='public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_billing_reference_reviewed_service_billing_check
      check (billing_reference_reviewed_service_billing is null or billing_reference_reviewed_service_billing >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='orders_billing_reference_reviewed_limit_percent_check'
      and conrelid='public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_billing_reference_reviewed_limit_percent_check
      check (billing_reference_reviewed_limit_percent is null or billing_reference_reviewed_limit_percent between 5 and 7);
  end if;
end $$;

create or replace function public.admin_set_order_billing_reference(
  p_order_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_service public.services%rowtype;
  v_old_billing numeric(14,2);
  v_old_percent numeric(5,2);
  v_current_billing numeric(14,2);
  v_current_percent numeric(5,2);
  v_current_limit numeric(14,2);
  v_current_five numeric(14,2);
  v_current_seven numeric(14,2);
  v_budget_status text;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede definir la referencia presupuestaria del pedido.';
  end if;

  if p_mode is null or p_mode not in ('previous','current') then
    raise exception 'Modo inválido. Use previous o current.';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.status in ('entregado','cancelado') then
    raise exception 'Los pedidos cerrados conservan su referencia histórica y no pueden modificarse.';
  end if;

  select * into v_service
  from public.services
  where id=v_order.service_id;

  if not found then
    raise exception 'El servicio del pedido ya no existe.';
  end if;

  v_old_billing := coalesce(v_order.monthly_billing_snapshot,0);
  v_old_percent := greatest(5,least(7,coalesce(v_order.budget_limit_percent_snapshot,5)));
  v_current_billing := round(coalesce(v_service.monthly_billing,0)::numeric,2);
  v_current_percent := greatest(5,least(7,coalesce(v_service.budget_limit_percent,5)));
  v_current_limit := round(v_current_billing * v_current_percent / 100,2);
  v_current_five := round(v_current_billing * 0.05,2);
  v_current_seven := round(v_current_billing * 0.07,2);

  if p_mode='current' then
    if v_current_billing <= 0 then
      v_budget_status := 'sin_configurar';
    elsif v_order.total_amount > v_current_seven then
      v_budget_status := 'sobre_7';
    elsif v_order.total_amount > v_current_limit then
      v_budget_status := 'sobre_limite';
    else
      v_budget_status := 'dentro';
    end if;

    update public.orders
    set monthly_billing_snapshot=v_current_billing,
        budget_limit_percent_snapshot=v_current_percent,
        budget_limit_amount_snapshot=v_current_limit,
        budget_five_percent_snapshot=v_current_five,
        budget_seven_percent_snapshot=v_current_seven,
        budget_status=v_budget_status,
        billing_reference_decision='current',
        billing_reference_reviewed_service_billing=v_current_billing,
        billing_reference_reviewed_limit_percent=v_current_percent,
        billing_reference_reviewed_at=now(),
        billing_reference_reviewed_by=auth.uid()
    where id=v_order.id
    returning * into v_order;

    v_note := format(
      'Referencia presupuestaria actualizada: facturación $ %s → $ %s; límite %s%% → %s%%. El pedido pasa a trabajar con la referencia actual del servicio.',
      to_char(v_old_billing,'FM999999999990.00'),
      to_char(v_current_billing,'FM999999999990.00'),
      to_char(v_old_percent,'FM990.00'),
      to_char(v_current_percent,'FM990.00')
    );
  else
    update public.orders
    set billing_reference_decision='previous',
        billing_reference_reviewed_service_billing=v_current_billing,
        billing_reference_reviewed_limit_percent=v_current_percent,
        billing_reference_reviewed_at=now(),
        billing_reference_reviewed_by=auth.uid()
    where id=v_order.id
    returning * into v_order;

    v_note := format(
      'Referencia presupuestaria revisada: se mantiene la facturación anterior de $ %s con límite %s%%. La facturación actual del servicio es $ %s con límite %s%%.',
      to_char(v_old_billing,'FM999999999990.00'),
      to_char(v_old_percent,'FM990.00'),
      to_char(v_current_billing,'FM999999999990.00'),
      to_char(v_current_percent,'FM990.00')
    );
  end if;

  insert into public.order_status_history(order_id,old_status,new_status,changed_by,notes)
  values(v_order.id,v_order.status,v_order.status,auth.uid(),v_note);

  return jsonb_build_object(
    'id',v_order.id,
    'order_code',v_order.order_code,
    'mode',p_mode,
    'monthly_billing_snapshot',v_order.monthly_billing_snapshot,
    'budget_limit_percent_snapshot',v_order.budget_limit_percent_snapshot,
    'budget_limit_amount_snapshot',v_order.budget_limit_amount_snapshot,
    'budget_seven_percent_snapshot',v_order.budget_seven_percent_snapshot,
    'budget_status',v_order.budget_status,
    'updated_at',v_order.updated_at
  );
end;
$$;

revoke all on function public.admin_set_order_billing_reference(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_set_order_billing_reference(uuid,text) to authenticated;
