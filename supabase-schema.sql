-- Pedidos Clean It · esquema Supabase v6 · edición administrativa de pedidos
-- Ejecutar completo en Supabase > SQL Editor sobre un proyecto nuevo.
-- La aplicación pública usa únicamente funciones RPC seguras; no expone las tablas al rol anon.

create extension if not exists pgcrypto;
create sequence if not exists public.order_code_seq start with 1;

create table if not exists public.services(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  description text,
  notes text,
  zone text,
  supervisor text,
  monthly_billing numeric(14,2) not null default 0 check(monthly_billing >= 0),
  budget_limit_percent numeric(5,2) not null default 5 check(budget_limit_percent between 5 and 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sku text,
  category text not null,
  detail text,
  unit text not null default 'unidad',
  image_url text,
  suggested_quantity numeric(12,2) not null default 1 check(suggested_quantity > 0 and suggested_quantity <= 999),
  unit_price numeric(14,2) not null default 0 check(unit_price >= 0),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una fila representa que un insumo está oculto para un servicio.
-- La ausencia de fila significa visible, por lo que todos los insumos quedan habilitados por defecto.
create table if not exists public.service_material_exclusions(
  service_id uuid not null references public.services(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(service_id,material_id)
);

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'operator' check(role in('admin','supplier','operator')),
  service_id uuid references public.services(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default ('PED-' || lpad(nextval('public.order_code_seq')::text,6,'0')),
  service_id uuid not null references public.services(id) on delete restrict,
  reporter_name text not null check(char_length(btrim(reporter_name)) between 2 and 100),
  priority text not null default 'normal' check(priority in('normal','urgente')),
  status text not null default 'pendiente' check(status in('pendiente','preparacion','enviado','entregado','cancelado')),
  notes text check(notes is null or char_length(notes) <= 500),
  total_items integer not null default 0 check(total_items >= 0),
  total_units numeric(14,2) not null default 0 check(total_units >= 0),
  total_amount numeric(14,2) not null default 0 check(total_amount >= 0),
  pickup_at_naon boolean,
  discount_percent_snapshot numeric(5,2) not null default 0 check(discount_percent_snapshot between 0 and 100),
  gross_total_amount numeric(14,2) not null default 0 check(gross_total_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check(discount_amount >= 0),
  monthly_billing_snapshot numeric(14,2) not null default 0 check(monthly_billing_snapshot >= 0),
  budget_limit_percent_snapshot numeric(5,2) not null default 5 check(budget_limit_percent_snapshot between 5 and 7),
  budget_limit_amount_snapshot numeric(14,2) not null default 0 check(budget_limit_amount_snapshot >= 0),
  budget_five_percent_snapshot numeric(14,2) not null default 0 check(budget_five_percent_snapshot >= 0),
  budget_seven_percent_snapshot numeric(14,2) not null default 0 check(budget_seven_percent_snapshot >= 0),
  budget_status text not null default 'sin_configurar' check(budget_status in('sin_configurar','dentro','sobre_limite','sobre_7')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  item_name text not null,
  item_sku text,
  category text,
  unit text not null default 'unidad',
  quantity numeric(12,2) not null check(quantity > 0 and quantity <= 999),
  list_unit_price numeric(14,2) not null check(list_unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check(discount_percent between 0 and 100),
  unit_price numeric(14,2) not null default 0 check(unit_price >= 0),
  line_total numeric(14,2) not null default 0 check(line_total >= 0),
  notes text check(notes is null or char_length(notes) <= 300),
  image_url text,
  is_custom boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history(
  id bigint generated by default as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  notes text,
  changed_at timestamptz not null default now()
);

create unique index if not exists idx_materials_sku_unique on public.materials(lower(sku)) where sku is not null and btrim(sku) <> '';
create index if not exists idx_service_material_exclusions_material on public.service_material_exclusions(material_id);
create index if not exists idx_profiles_service on public.profiles(service_id);
create index if not exists idx_orders_service on public.orders(service_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_priority on public.orders(priority);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_history_order on public.order_status_history(order_id);
create index if not exists idx_order_history_changed on public.order_status_history(changed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at before update on public.materials for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();


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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'operator')
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users for each row execute function public.handle_new_user();

insert into public.profiles(id,email,full_name,role)
select id,email,coalesce(raw_user_meta_data->>'full_name',split_part(email,'@',1)),'operator'
from auth.users
on conflict(id) do update set email=excluded.email;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in('admin','supplier'));
$$;

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

-- Reemplazo atómico del catálogo oculto de un servicio.
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

create or replace function public.prepare_order_status()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('entregado','cancelado') and (old.status is distinct from new.status or old.closed_at is null) then
    new.closed_at = now();
  elsif new.status not in ('entregado','cancelado') then
    new.closed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_prepare_status on public.orders;
create trigger orders_prepare_status before update on public.orders for each row execute function public.prepare_order_status();

create or replace function public.audit_order_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    insert into public.order_status_history(order_id,old_status,new_status,changed_by,notes)
    values(new.id,null,new.status,auth.uid(),'Pedido creado');
  elsif old.status is distinct from new.status then
    insert into public.order_status_history(order_id,old_status,new_status,changed_by)
    values(new.id,old.status,new.status,auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_audit on public.orders;
create trigger orders_status_audit after insert or update of status on public.orders for each row execute function public.audit_order_status();

alter table public.services enable row level security;
alter table public.materials enable row level security;
alter table public.service_material_exclusions enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists services_admin_read on public.services;
drop policy if exists services_admin_write on public.services;
drop policy if exists services_staff_read on public.services;
drop policy if exists services_admin_all on public.services;
create policy services_staff_read on public.services for select to authenticated using(public.is_staff());
create policy services_admin_all on public.services for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists materials_admin_read on public.materials;
drop policy if exists materials_admin_write on public.materials;
drop policy if exists materials_staff_read on public.materials;
drop policy if exists materials_admin_all on public.materials;
create policy materials_staff_read on public.materials for select to authenticated using(public.is_staff());
create policy materials_admin_all on public.materials for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists service_material_exclusions_admin_all on public.service_material_exclusions;
drop policy if exists service_material_exclusions_staff_read on public.service_material_exclusions;
drop policy if exists service_material_exclusions_admin_all_v2 on public.service_material_exclusions;
create policy service_material_exclusions_staff_read on public.service_material_exclusions for select to authenticated using(public.is_staff());
create policy service_material_exclusions_admin_all_v2 on public.service_material_exclusions for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists profiles_self_admin_read on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_staff_read on public.profiles;
drop policy if exists profiles_admin_update_v2 on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_staff());
create policy profiles_admin_update_v2 on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists orders_admin_all on public.orders;
drop policy if exists orders_staff_read on public.orders;
drop policy if exists orders_admin_all_v2 on public.orders;
create policy orders_staff_read on public.orders for select to authenticated using(public.is_staff());
create policy orders_admin_all_v2 on public.orders for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists order_items_admin_all on public.order_items;
drop policy if exists order_items_staff_read on public.order_items;
drop policy if exists order_items_admin_all_v2 on public.order_items;
create policy order_items_staff_read on public.order_items for select to authenticated using(public.is_staff());
create policy order_items_admin_all_v2 on public.order_items for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists order_history_admin_read on public.order_status_history;
drop policy if exists order_history_staff_read on public.order_status_history;
create policy order_history_staff_read on public.order_status_history for select to authenticated using(public.is_staff());

-- Lectura pública controlada del selector y catálogo.
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

-- Alta pública de pedidos. El rol anon no recibe acceso directo a ninguna tabla.
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
  select * into v_service
  from public.services
  where id=p_service_id and active=true;

  if not found then
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

  v_five_amount := round(v_service.monthly_billing * 0.05, 2);
  v_seven_amount := round(v_service.monthly_billing * 0.07, 2);
  v_limit_amount := round(v_service.monthly_billing * v_service.budget_limit_percent / 100, 2);

  insert into public.orders(
    service_id,reporter_name,priority,notes,created_by,
    monthly_billing_snapshot,budget_limit_percent_snapshot,
    budget_limit_amount_snapshot,budget_five_percent_snapshot,budget_seven_percent_snapshot
  )
  values(
    p_service_id,btrim(p_reporter_name),coalesce(p_priority,'normal'),
    nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),
    v_service.monthly_billing,v_service.budget_limit_percent,
    v_limit_amount,v_five_amount,v_seven_amount
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_quantity := nullif(v_item->>'quantity','')::numeric;
    exception when invalid_text_representation then
      raise exception 'Una de las cantidades no es válida.';
    end;
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

      v_unit_price := v_material.unit_price;
      v_line_total := round(v_quantity * v_unit_price, 2);

      insert into public.order_items(
        order_id,material_id,item_name,item_sku,category,unit,quantity,unit_price,line_total,
        notes,image_url,is_custom,sort_order
      )
      values(
        v_order.id,v_material.id,v_material.name,nullif(btrim(v_material.sku),''),v_material.category,
        v_material.unit,v_quantity,v_unit_price,v_line_total,null,v_material.image_url,false,v_material.sort_order
      );
    else
      v_custom_name := btrim(coalesce(v_item->>'custom_name',''));
      v_custom_sku := nullif(btrim(coalesce(v_item->>'sku','')),'');
      v_unit := btrim(coalesce(v_item->>'unit','unidad'));
      v_item_notes := nullif(btrim(coalesce(v_item->>'notes','')),'');

      begin
        v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric,0);
      exception when invalid_text_representation then
        raise exception 'El precio del insumo no listado no es válido.';
      end;

      if char_length(v_custom_name) not between 2 and 120 then
        raise exception 'El nombre del insumo no listado no es válido.';
      end if;
      if v_custom_sku is not null and char_length(v_custom_sku) > 80 then
        raise exception 'El SKU del insumo no listado es demasiado extenso.';
      end if;
      if char_length(v_unit) not between 1 and 60 then
        raise exception 'La unidad del insumo no listado no es válida.';
      end if;
      if v_unit_price < 0 or v_unit_price > 999999999.99 then
        raise exception 'El precio del insumo no listado no es válido.';
      end if;
      if v_item_notes is not null and char_length(v_item_notes) > 300 then
        raise exception 'El detalle del insumo no listado es demasiado extenso.';
      end if;

      v_line_total := round(v_quantity * v_unit_price, 2);

      insert into public.order_items(
        order_id,material_id,item_name,item_sku,category,unit,quantity,unit_price,line_total,
        notes,image_url,is_custom,sort_order
      )
      values(
        v_order.id,null,v_custom_name,v_custom_sku,'Excepción',v_unit,v_quantity,v_unit_price,v_line_total,
        v_item_notes,'assets/materials/default.svg',true,9999
      );
    end if;

    v_count := v_count + 1;
    v_total_units := v_total_units + v_quantity;
    v_total_amount := v_total_amount + v_line_total;
  end loop;

  if v_service.monthly_billing <= 0 then
    v_budget_status := 'sin_configurar';
  elsif v_total_amount > v_seven_amount then
    v_budget_status := 'sobre_7';
  elsif v_total_amount > v_limit_amount then
    v_budget_status := 'sobre_limite';
  else
    v_budget_status := 'dentro';
  end if;

  update public.orders
  set total_items=v_count,
      total_units=v_total_units,
      total_amount=v_total_amount,
      budget_status=v_budget_status
  where id=v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'id',v_order.id,
    'order_code',v_order.order_code,
    'created_at',v_order.created_at,
    'item_count',v_order.total_items,
    'total_units',v_order.total_units,
    'total_amount',v_order.total_amount,
    'monthly_billing',v_order.monthly_billing_snapshot,
    'budget_limit_percent',v_order.budget_limit_percent_snapshot,
    'budget_limit_amount',v_order.budget_limit_amount_snapshot,
    'budget_five_amount',v_order.budget_five_percent_snapshot,
    'budget_seven_amount',v_order.budget_seven_percent_snapshot,
    'budget_status',v_order.budget_status
  );
exception when others then
  raise;
end;
$$;


-- Edición atómica del contenido de un pedido por un administrador.
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

-- Acceso de supervisores: el catálogo y el alta de pedidos requieren sesión.
create or replace function public.supervisor_order_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles where id=auth.uid() and role='operator'
  ) then
    raise exception 'Acceso exclusivo para supervisores habilitados.';
  end if;
  return public.public_order_bootstrap();
end;
$$;

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
    select 1 from public.profiles where id=auth.uid() and role='operator'
  ) then
    raise exception 'Acceso exclusivo para supervisores habilitados.';
  end if;

  if char_length(btrim(coalesce(p_reporter_name,''))) not between 2 and 100 then
    raise exception 'Ingresá el nombre del operario responsable.';
  end if;

  return public.public_create_order(p_service_id,btrim(p_reporter_name),p_priority,p_notes,p_items);
end;
$$;

revoke all on public.services, public.materials, public.service_material_exclusions, public.profiles, public.orders, public.order_items, public.order_status_history from anon;
grant select,insert,update,delete on public.services, public.materials, public.service_material_exclusions, public.profiles, public.orders, public.order_items, public.order_status_history to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on function public.public_order_bootstrap() from public,anon,authenticated;
revoke all on function public.public_create_order(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.supervisor_order_bootstrap() from public,anon,authenticated;
revoke all on function public.supervisor_create_order(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.supervisor_order_bootstrap() to authenticated;
grant execute on function public.supervisor_create_order(uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.staff_update_order_status(uuid,text,text) from public;
grant execute on function public.staff_update_order_status(uuid,text,text) to authenticated;
revoke all on function public.admin_set_service_hidden_materials(uuid,uuid[]) from public;
grant execute on function public.admin_set_service_hidden_materials(uuid,uuid[]) to authenticated;

-- Bucket público para imágenes cargadas desde Administración.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('material-images','material-images',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists material_images_public_read on storage.objects;
drop policy if exists material_images_admin_insert on storage.objects;
drop policy if exists material_images_admin_update on storage.objects;
drop policy if exists material_images_admin_delete on storage.objects;
create policy material_images_public_read on storage.objects for select using(bucket_id='material-images');
create policy material_images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='material-images' and public.is_admin());
create policy material_images_admin_update on storage.objects for update to authenticated using(bucket_id='material-images' and public.is_admin()) with check(bucket_id='material-images' and public.is_admin());
create policy material_images_admin_delete on storage.objects for delete to authenticated using(bucket_id='material-images' and public.is_admin());

-- Realtime para el panel administrativo.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['orders','order_items','order_status_history','materials','services','service_material_exclusions','profiles']
  loop
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end;
$$;

-- Datos iniciales

insert into public.services(name,address,description,notes,zone,supervisor,active) values
  ('Alvarez Thomas 550- Colegiales','Alvarez Thomas 550','Lunes a viernes de 13 a 17 hs. Sábado de 8 a 12 hs.',null,'Colegiales','José',true),
  ('America Tampas- P.Industrial Pilar','Parque industrial, C. 9 1761, B1629 Pilar','Lunes a viernes de 8 a 16 hs. Sábado de 8 a 12 hs.',null,'Pilar','José',true),
  ('Av De los Incas 3502','Av De los Incas 3502','Lunes, miércoles y viernes de 13 a 17 hs.',null,'Belgrano','José',true),
  ('Av MITRE 5834 - Caseros','Av MITRE 5834 - Caseros','Lunes, miércoles y viernes de 7:30 a 11:30 hs.',null,'Caseros','Andres',true),
  ('Av. San Juan 440','Av. San Juan 440','Martes, jueves y sábado de 8 a 12 hs.',null,'San Telmo',null,true),
  ('Callao 441 - Centro','Callao 441 - Centro','Lunes a viernes de 13 a 17 hs.',null,'Centro','Leo',true),
  ('Ceretti 2161 - Villa Urquiza','Ceretti 2161','Lunes a sábados de 8 a 12 hs.',null,'Villa Urquiza','Jose',true),
  ('Céspedes 2524, CABA','Céspedes 2524 - Adm Holmberg/Cespedes - Fernando','Lunes a viernes de 8 a 12 hs.',null,'Colegiales','José',true),
  ('cons Cabildo 2659','Cabildo 2659','Lunes a viernes de 13 a 16 hs.',null,'Belgrano','José',true),
  ('Cons. Agrelo 3641- Boedo','Agrelo 3641','Lunes, miércoles y viernes de 11:30 a 13:30 hs.',null,'Boedo',null,true),
  ('Cons. Araujo 61-Villa Luro','Araujo 61','Lunes, miércoles y viernes de 9 a 12 hs.',null,'Villa Luro',null,true),
  ('Cons. Av Directorio 1821','Av Directorio 1821','Viernes de 12:30 a 15:30 hs.',null,'Flores',null,true),
  ('Cons. Av Los Incas 3501','Av Los Incas 3501','Lunes a sábados de 8 a 12 hs.',null,'Belgrano R','Jose',true),
  ('Cons. Beiro 4545- Villa Devoto','Avenida Beiro 4545','Lunes a sábados de 8:30 a 12:30 hs.','Lunes a sábados 8:30 a 12:30','Villa Devoto','Jose',true),
  ('Cons. Cabildo 2737- Nuñez','Cabildo 2737','Lunes a viernes de 8 a 12 hs.',null,'Nuñez','Jose',true),
  ('Cons. Cachimayo 748- Parque Chacabuco','Cachimayo 748','Lunes a sábados de 8 a 12 hs.',null,'Parque Chacabuco',null,true),
  ('Cons. Catamarca 586- San Cristóbal','Catamarca 586','Lunes, miércoles y viernes de 13 a 16 hs.',null,'San Cristóbal',null,true),
  ('Cons. Cnel Diaz 1450','Coronel Diaz 1450','Lunes, miércoles y viernes de 8 a 12 hs.',null,'Recoleta/Palermo','Jose',true),
  ('Cons. Darwin 524- Villa Crespo','Darwin 524','Martes, jueves y sábado de 8 a 12 hs.',null,'Villa Crespo','José',true),
  ('Cons. Gualeguaychú 1938- Villa Devoto','Gualeguaychú 1938','Martes, jueves y sábado de 8 a 12 hs.',null,'Villa Devoto','Leo',true),
  ('Cons. Gualeguaychú 3809/11 caba','Gualeguaychú 3809','Martes y jueves de 8 a 11 hs.',null,'Villa Devoto','Jose',true),
  ('Cons. Guardia Vieja 3919-Villa Crespo','Guardia Vieja 3919','Martes y sábado de 8 a 12 hs.',null,'Villa Crespo','Jose',true),
  ('Cons. Hipólito Yrigoyen 3132- Once','Hipólito Yrigoyen 3132','Martes y jueves de 13 a 17 hs. Sábado de 8 a 12 hs.',null,'Once',null,true),
  ('Cons. Jose Hernández 2678- Belgrano','Jose Hernández 2678','Lunes y viernes de 8 a 11 hs.',null,'Belgrano','Jose',true),
  ('Cons. José Marmol 2134 CABA','José Marmol 2134','Lunes, miércoles y viernes de 8 a 12 hs.',null,'Boedo',null,true),
  ('Cons. Juian Álvarez 1340- Villa Crespo','Julian Álvarez 1340','Martes y jueves de 7 a 12 hs. Sábado de 7 a 13 hs.',null,'Villa Crespo',null,true),
  ('Cons. Juncal 2899','Juncal 2899','Lunes a sábados de 8 a 12 hs.',null,'Palermo','Jose',true),
  ('Cons. Lascano 4032','Lascano 4032','Miércoles y sábado de 8 a 12 hs.',null,'Monte Castro',null,true),
  ('Cons. Lezica 4475','Lezica 4475','Lunes a sábados de 8 a 12 hs.',null,'Almagro','Leonardo',true),
  ('Cons. Luis M Campos 1027','Luis M Campos 1027','Lunes a viernes de 8 a 14 hs. Sábado de 8 a 12 hs.',null,'Palermo','Jose',true),
  ('Cons. Manzanares 1753','Manzanares 1753','Martes, jueves y sábado de 13 a 17 hs.',null,'Nuñez','José',true),
  ('Cons. Migueletes 1762','Migueletes 1762','Martes, jueves y sábado de 8 a 12 hs.',null,'Belgrano','Jose',true),
  ('Cons. MIRABILA Humboldt 2045 CABA','Humboldt 2045','Sin cobertura activa informada en el archivo.',null,'Palermo','Jose/Leo',true),
  ('Cons. Moldes 1648- Nuñez','Moldes 1648','Lunes, miércoles y viernes de 8 a 12 hs.',null,'Nuñez','Jose',true),
  ('Cons. Olagüer y Feliu 2970- Colegiales','Olagüer y Feliu 2970','Lunes a sábados de 13 a 16 hs.',null,'Colegiales','Jose',true),
  ('Cons. Plaza 3547- Coghlan','Plaza 3547','Martes y viernes de 16 a 19 hs.',null,'Coghlan','Jose',true),
  ('Cons. Puan 256/60- Caballito','Puan 256/60','Martes, jueves y sábado de 8 a 12 hs.',null,'Caballito',null,true),
  ('Cons. Rivadavia 9037-Floresta','Rivadavia 9037','Martes, jueves y sábado de 8 a 12 hs.',null,'Floresta',null,true),
  ('Cons. Roosevelt 1926- Belgrano','Roosevelt 1926','Lunes, miércoles y viernes de 8 a 12 hs.',null,'Belgrano','Jose',true),
  ('Cons.Aristobulo del Valle 1301-La Boca.','Aristobulo del Valle 1301','Lunes a viernes de 8 a 16 hs. Sábado de 8 a 12 hs.',null,'La Boca',null,true),
  ('Cons.Ciudad de la Paz 575','Ciudad de la Paz 575','Martes, jueves y sábado de 8 a 12 hs.',null,'Palermo','Jose',true),
  ('Cons.Palacio Cabrera 5356- Palermo','Cabrera 5356','Lunes a viernes de 8 a 14 hs. Sábado de 8 a 12 hs.',null,'Palermo','Jose',true),
  ('Cons.Thomas Le Bretón 5153 - Villa Urquiza','Le Bretón 5153','Martes, jueves y sábado de 8 a 12 hs.',null,'Villa Urquiza','Jose',true),
  ('Florentino Ameghino 680','Florentino Ameghino 680','Lunes, miércoles y viernes de 12 a 16 hs.',null,'Parque Avellaneda',null,true),
  ('Gym Formosa 168- Parque Chacabuco','Formosa 168','Martes y jueves de 13 a 17 hs.',null,'Parque Chacabuco',null,true),
  ('Holmberg 4150 - Saavedra','Holmberg 4150','Miércoles y viernes de 13 a 17 hs.',null,'Saavedra','Jose',true),
  ('ISEM SA','Emilio Mitre 1970','Lunes, miércoles y jueves de 12:30 a 16:30 hs.','DE BAJA','Parque Chacabuco',null,true),
  ('Laboratorio Eurolab -Juan de Garay 3831-Boedo','Juan de Garay 3831','Lunes a viernes de 8 a 11 hs.',null,'Boedo',null,true),
  ('Ludoplast Caseros LEONISMO ARGENTINO 3264 -CASEROS','LEONISMO ARGENTINO 3264','Lunes, miércoles y viernes de 8 a 12 hs.',null,'CASEROS','Jose',true),
  ('Martinez castro 263','Martinez castro 263','Lunes y miércoles de 9 a 12 hs. Viernes de 8 a 12 hs.',null,'Velez Sarfield',null,true),
  ('Molycentro - A- Lamas 2135- V- Crespo','Andres Lamas 2135','Lunes, miércoles y viernes de 8 a 12 hs.',null,'Villa Crespo',null,true),
  ('Molysil Avellaneda - Catamarca 1856','Catamarca 1856','Martes y jueves de 12 a 17 hs.',null,'Avellaneda',null,true),
  ('Molysil- Olagüer y Feliü 3398 Colegiales','Olagüer y Feliü 3398','Martes y jueves de 7:30 a 11:30 hs.',null,'Colegiales','Jose',true),
  ('Monteagudo 121 Ramos Mejia','Monteagudo 121 Ramos Mejia - Adrián Palumbo','Lunes a sábados de 13 a 19 hs.',null,'Ramos Mejía','José',true),
  ('mundo chipa','Estrada 1859, villa maipú','Lunes a viernes de 13 a 17 hs.',null,'villa maipú','Jose',true),
  ('Oficina Av Cordoba 1309','Av Cordoba 1309','Lunes, miércoles y viernes de 14 a 18 hs. Martes y jueves de 16 a 18 hs.',null,'Retiro',null,true),
  ('Oficina Naon Casa Central','Naon 3475','Lunes, miércoles y viernes de 12:30 a 16:30 hs.',null,'Coghlan','Jose/Leo',true),
  ('Pergamino 160','Pergamino 160','Lunes, miércoles y viernes de 8 a 12 hs.',null,'Floresta',null,true),
  ('Peru 1566','Peru 1566','Sin cobertura activa informada en el archivo.','BAJA A PARTIR DEL 5/6','San Telmo',null,true),
  ('Serv Warnes 1243 caba','Warnes 1243','Lunes, miércoles y viernes de 8 a 13 hs.',null,'Villa Crespo','Jose',true),
  ('sp . Vte López. Libertad 1650','Libertad 1650','Lunes a viernes de 7 a 15 hs. Sábado de 9 a 13 hs.',null,'Vicente Lopez','Jose',true),
  ('SP Const - Pueyrredón','Av. de los Constituyentes 6020','Lunes a viernes de 9 a 13 y 17 a 22 hs. Sábado de 10 a 14 hs.',null,'Villa Pueyrredón','Jose',true),
  ('Spital Hnos','COLECTORA, Acceso Sudeste KM. 12, Los Ciruelos 3748, B1874 Sarandí','Lunes, martes, miércoles y viernes de 9 a 14 hs. Jueves de 9 a 13 hs.','BAJA','Sarandí','Leonardo',true),
  ('Virrey Olaguer y Feliu 2453 CABA','Virrey Olaguer y Feliu 2453 - Kestelboim','Lunes a sábados de 8 a 12 hs.',null,'Colegiales','José',true)
on conflict(name) do update set address=excluded.address,description=excluded.description,notes=excluded.notes,zone=excluded.zone,supervisor=excluded.supervisor,active=excluded.active;

insert into public.materials(slug,name,category,detail,unit,image_url,suggested_quantity,sort_order,active) values
  ('detergente-bio-ultra','Detergente ultraconcentrado','Químicos','Bio Ultra - Thames · bidón x 5 Lts','bidón x 5 Lts','assets/materials/detergente-bio-ultra.svg',1.0,10,true),
  ('perfume-flower','Perfume o aromatizante de piso','Químicos','Flower - Thames · bidón x 5 Lts','bidón x 5 Lts','assets/materials/perfume-flower.svg',1.0,20,true),
  ('lavandina-bio-lav','Lavandina líquida desinfectante','Químicos','Bio Lav - Thames · bidón x 5 Lts','bidón x 5 Lts','assets/materials/lavandina-bio-lav.svg',1.0,30,true),
  ('rapid-plus-gel','Lavandina en gel desinfectante','Químicos','Rapid Plus en gel - Thames · 500 ml','envase x 500 ml','assets/materials/rapid-plus-gel.svg',1.0,40,true),
  ('wood-thames','Wood','Químicos','Thames · 360 cm3','envase x 360 cm3','assets/materials/wood-thames.svg',1.0,50,true),
  ('steel-shine','Steel Shine','Químicos','Thames · 390 cm3','aerosol x 390 cm3','assets/materials/steel-shine.svg',1.0,60,true),
  ('cream-thames','Cream','Químicos','Thames · 500 ml','envase x 500 ml','assets/materials/cream-thames.svg',1.0,70,true),
  ('sarro-attack','Sarro Attack','Químicos','Thames · 500 ml','envase x 500 ml','assets/materials/sarro-attack.svg',1.0,80,true),
  ('smell-thames','Smell o aromatizante ambiental','Químicos','Thames · 262 ml','envase x 262 ml','assets/materials/smell-thames.svg',3.0,90,true),
  ('alcohol-al70','Alcohol AL70','Químicos','Thames · bidón x 5 Lts · sugerido para gimnasio','bidón x 5 Lts','assets/materials/alcohol-al70.svg',1.0,100,true),
  ('bolsas-negras-45-60','Bolsas negras 45x60','Bolsas','Paquete de bolsas de residuos color negro','paquete','assets/materials/bolsas-negras-45-60.svg',1.0,110,true),
  ('bolsas-verdes-45-60','Bolsas verdes 45x60','Bolsas','Paquete de bolsas de residuos color verde','paquete','assets/materials/bolsas-verdes-45-60.svg',1.0,120,true),
  ('bolsas-negras-70-50','Bolsas negras 70x50','Bolsas','Paquete de bolsas de residuos color negro','paquete','assets/materials/bolsas-negras-70-50.svg',1.0,130,true),
  ('bolsas-verdes-70-50','Bolsas verdes 70x50','Bolsas','Paquete de bolsas de residuos color verde','paquete','assets/materials/bolsas-verdes-70-50.svg',1.0,140,true),
  ('bolsas-negras-90-110','Bolsas negras 90x110','Bolsas','Paquete de bolsas de residuos color negro','paquete','assets/materials/bolsas-negras-90-110.svg',1.0,150,true),
  ('bolsas-verdes-90-110','Bolsas verdes 90x110','Bolsas','Paquete de bolsas de residuos color verde','paquete','assets/materials/bolsas-verdes-90-110.svg',1.0,160,true),
  ('guantes-mapa-8','Guantes Mapa Talle 8','Elementos','Par de guantes','par','assets/materials/guantes-mapa-8.svg',1.0,170,true),
  ('balde-reforzado','Balde reforzado','Elementos','10 Lts','unidad','assets/materials/balde-reforzado.svg',1.0,180,true),
  ('pulverizador-gatillo','Pulverizador de 1 Lt + Gatillo','Elementos','Botella pulverizadora completa','unidad','assets/materials/pulverizador-gatillo.svg',2.0,190,true),
  ('medidor','Medidor','Elementos','Para dosificación de productos','unidad','assets/materials/medidor.svg',1.0,200,true),
  ('embudo-mediano','Embudo mediano','Elementos','Para trasvase controlado','unidad','assets/materials/embudo-mediano.svg',1.0,210,true),
  ('escoba-cabo','Escoba + Cabo metálico','Utensilios','Kit completo','unidad','assets/materials/escoba-cabo.svg',2.0,220,true),
  ('escobillon-cochera','Escobillón largo base madera + Cabo metálico','Utensilios','Para servicios con cochera','unidad','assets/materials/escobillon-cochera.svg',1.0,230,true),
  ('pala-cabo','Pala + Cabo metálico','Utensilios','Kit completo','unidad','assets/materials/pala-cabo.svg',1.0,240,true),
  ('secador-cabo','Secador + Cabo metálico','Utensilios','Kit completo','unidad','assets/materials/secador-cabo.svg',1.0,250,true),
  ('trapo-piso','Trapo de piso','Paños y fibras','Uso operativo general','unidad','assets/materials/trapo-piso.svg',2.0,260,true),
  ('rejilla','Rejilla','Paños y fibras','Uso operativo general','unidad','assets/materials/rejilla.svg',2.0,270,true),
  ('microfibra','Microfibra','Paños y fibras','Uso operativo general','unidad','assets/materials/microfibra.svg',2.0,280,true),
  ('fibra-verde','Fibra verde','Paños y fibras','Uso operativo general','unidad','assets/materials/fibra-verde.svg',2.0,290,true),
  ('esponja-acero','Esponja acero inoxidable','Paños y fibras','Uso operativo específico','unidad','assets/materials/esponja-acero.svg',2.0,300,true),
  ('esponja-amarilla','Esponja amarilla','Paños y fibras','Uso operativo general','unidad','assets/materials/esponja-amarilla.svg',2.0,310,true),
  ('plumero-microfibra','Plumero microfibra','Utensilios','Para superficies y altura baja','unidad','assets/materials/plumero-microfibra.svg',1.0,320,true),
  ('ballerina','Ballerina','Paños y fibras','Uso operativo general','unidad','assets/materials/ballerina.svg',2.0,330,true),
  ('kit-vidrios','Corderito + Secador + Agarre secador','Vidrios y altura','Kit para limpieza de vidrios','kit','assets/materials/kit-vidrios.svg',1.0,340,true),
  ('globo-telaranas','Globo para telarañas + cabo telescópico','Vidrios y altura','Cabo telescópico 2 + 2 metros','unidad','assets/materials/globo-telaranas.svg',1.0,350,true)
on conflict(slug) do update set name=excluded.name,category=excluded.category,detail=excluded.detail,unit=excluded.unit,image_url=excluded.image_url,suggested_quantity=excluded.suggested_quantity,sort_order=excluded.sort_order,active=excluded.active;



-- Pedidos Clean It · módulo de consumos por servicio
-- Ejecutar en Supabase > SQL Editor sobre el proyecto actual.
-- No modifica pedidos existentes. Agrega índices y funciones de reporte exclusivas para administradores.

create index if not exists idx_orders_consumption_delivered
  on public.orders(service_id, closed_at, updated_at)
  where status = 'entregado';

create index if not exists idx_order_items_consumption_material
  on public.order_items(order_id, material_id);

create or replace function public.admin_consumption_service_summary(
  p_month date default date_trunc('month', now())::date,
  p_service_id uuid default null
)
returns table(
  service_id uuid,
  service_name text,
  month_orders bigint,
  month_products bigint,
  month_amount numeric,
  previous_month_amount numeric,
  avg_previous_3_amount numeric,
  previous_3_months_with_activity bigint,
  historical_amount numeric,
  historical_orders bigint,
  last_consumption_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  p_month := date_trunc('month', coalesce(p_month, current_date))::date;

  return query
  with delivered_orders as (
    select
      o.id as order_id,
      o.service_id,
      date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date as consumption_month,
      coalesce(o.closed_at, o.updated_at, o.created_at) as consumed_at,
      o.total_amount
    from public.orders o
    where o.status = 'entregado'
      and (p_service_id is null or o.service_id = p_service_id)
  ),
  product_counts as (
    select
      d.service_id,
      count(distinct case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end)::bigint as products
    from delivered_orders d
    join public.order_items oi on oi.order_id = d.order_id
    where d.consumption_month = p_month
    group by d.service_id
  )
  select
    s.id,
    s.name,
    count(distinct d.order_id) filter (where d.consumption_month = p_month)::bigint as month_orders,
    coalesce(pc.products, 0)::bigint as month_products,
    coalesce(sum(d.total_amount) filter (where d.consumption_month = p_month), 0)::numeric as month_amount,
    coalesce(sum(d.total_amount) filter (where d.consumption_month = (p_month - interval '1 month')::date), 0)::numeric as previous_month_amount,
    (coalesce(sum(d.total_amount) filter (
      where d.consumption_month >= (p_month - interval '3 months')::date
        and d.consumption_month < p_month
    ), 0) / 3.0)::numeric as avg_previous_3_amount,
    count(distinct d.consumption_month) filter (
      where d.consumption_month >= (p_month - interval '3 months')::date
        and d.consumption_month < p_month
    )::bigint as previous_3_months_with_activity,
    coalesce(sum(d.total_amount), 0)::numeric as historical_amount,
    count(distinct d.order_id)::bigint as historical_orders,
    max(d.consumed_at) as last_consumption_at
  from public.services s
  left join delivered_orders d on d.service_id = s.id
  left join product_counts pc on pc.service_id = s.id
  where p_service_id is null or s.id = p_service_id
  group by s.id, s.name, pc.products
  order by s.name;
end;
$$;

create or replace function public.admin_consumption_report(
  p_month date default date_trunc('month', now())::date,
  p_service_id uuid default null
)
returns table(
  service_id uuid,
  service_name text,
  material_key text,
  material_id uuid,
  item_name text,
  item_sku text,
  unit text,
  month_quantity numeric,
  month_amount numeric,
  month_orders bigint,
  previous_month_quantity numeric,
  previous_month_amount numeric,
  avg_previous_3_quantity numeric,
  avg_previous_3_amount numeric,
  previous_3_months_with_activity bigint,
  historical_quantity numeric,
  historical_amount numeric,
  historical_orders bigint,
  last_consumption_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;

  p_month := date_trunc('month', coalesce(p_month, current_date))::date;

  return query
  with delivered_items as (
    select
      o.service_id,
      s.name as service_name,
      o.id as order_id,
      date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date as consumption_month,
      coalesce(o.closed_at, o.updated_at, o.created_at) as consumed_at,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as material_key,
      oi.material_id,
      oi.item_name,
      oi.item_sku,
      coalesce(nullif(btrim(oi.unit), ''), 'unidad') as unit,
      oi.quantity,
      oi.line_total
    from public.orders o
    join public.services s on s.id = o.service_id
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and (p_service_id is null or o.service_id = p_service_id)
  ),
  dimensions as (
    select distinct on (d.service_id, d.material_key)
      d.service_id,
      d.service_name,
      d.material_key,
      d.material_id,
      d.item_name,
      d.item_sku,
      d.unit
    from delivered_items d
    order by d.service_id, d.material_key, d.consumed_at desc, d.order_id desc
  ),
  monthly as (
    select
      d.service_id,
      d.material_key,
      d.consumption_month,
      sum(d.quantity)::numeric as quantity,
      sum(d.line_total)::numeric as amount,
      count(distinct d.order_id)::bigint as orders,
      max(d.consumed_at) as last_consumption_at
    from delivered_items d
    group by d.service_id, d.material_key, d.consumption_month
  )
  select
    dim.service_id,
    dim.service_name,
    dim.material_key,
    dim.material_id,
    dim.item_name,
    dim.item_sku,
    dim.unit,
    coalesce(sum(m.quantity) filter (where m.consumption_month = p_month), 0)::numeric as month_quantity,
    coalesce(sum(m.amount) filter (where m.consumption_month = p_month), 0)::numeric as month_amount,
    coalesce(sum(m.orders) filter (where m.consumption_month = p_month), 0)::bigint as month_orders,
    coalesce(sum(m.quantity) filter (where m.consumption_month = (p_month - interval '1 month')::date), 0)::numeric as previous_month_quantity,
    coalesce(sum(m.amount) filter (where m.consumption_month = (p_month - interval '1 month')::date), 0)::numeric as previous_month_amount,
    (coalesce(sum(m.quantity) filter (
      where m.consumption_month >= (p_month - interval '3 months')::date
        and m.consumption_month < p_month
    ), 0) / 3.0)::numeric as avg_previous_3_quantity,
    (coalesce(sum(m.amount) filter (
      where m.consumption_month >= (p_month - interval '3 months')::date
        and m.consumption_month < p_month
    ), 0) / 3.0)::numeric as avg_previous_3_amount,
    count(distinct m.consumption_month) filter (
      where m.consumption_month >= (p_month - interval '3 months')::date
        and m.consumption_month < p_month
        and m.quantity > 0
    )::bigint as previous_3_months_with_activity,
    coalesce(sum(m.quantity), 0)::numeric as historical_quantity,
    coalesce(sum(m.amount), 0)::numeric as historical_amount,
    coalesce(sum(m.orders), 0)::bigint as historical_orders,
    max(m.last_consumption_at) as last_consumption_at
  from dimensions dim
  left join monthly m
    on m.service_id = dim.service_id
   and m.material_key = dim.material_key
  group by
    dim.service_id,
    dim.service_name,
    dim.material_key,
    dim.material_id,
    dim.item_name,
    dim.item_sku,
    dim.unit
  order by dim.service_name, dim.item_name;
end;
$$;

create or replace function public.admin_consumption_history(
  p_service_id uuid,
  p_material_key text,
  p_until_month date default date_trunc('month', now())::date,
  p_months integer default 12
)
returns table(
  consumption_month date,
  quantity numeric,
  amount numeric,
  orders bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso restringido a administradores.';
  end if;
  if p_service_id is null or nullif(btrim(p_material_key), '') is null then
    raise exception 'Servicio e insumo son obligatorios.';
  end if;

  p_until_month := date_trunc('month', coalesce(p_until_month, current_date))::date;
  p_months := greatest(3, least(coalesce(p_months, 12), 36));

  return query
  with months as (
    select generate_series(
      p_until_month - make_interval(months => p_months - 1),
      p_until_month,
      interval '1 month'
    )::date as consumption_month
  ),
  delivered_items as (
    select
      date_trunc('month', coalesce(o.closed_at, o.updated_at, o.created_at))::date as consumption_month,
      o.id as order_id,
      oi.quantity,
      oi.line_total,
      case
        when oi.material_id is not null then 'material:' || oi.material_id::text
        when nullif(btrim(coalesce(oi.item_sku, '')), '') is not null then 'sku:' || lower(btrim(oi.item_sku))
        else 'custom:' || md5(lower(btrim(oi.item_name)) || '|' || lower(btrim(coalesce(oi.unit, 'unidad'))))
      end as material_key
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.status = 'entregado'
      and o.service_id = p_service_id
  ),
  monthly as (
    select
      d.consumption_month,
      sum(d.quantity)::numeric as quantity,
      sum(d.line_total)::numeric as amount,
      count(distinct d.order_id)::bigint as orders
    from delivered_items d
    where d.material_key = p_material_key
    group by d.consumption_month
  )
  select
    m.consumption_month,
    coalesce(a.quantity, 0)::numeric,
    coalesce(a.amount, 0)::numeric,
    coalesce(a.orders, 0)::bigint
  from months m
  left join monthly a on a.consumption_month = m.consumption_month
  order by m.consumption_month;
end;
$$;

revoke all on function public.admin_consumption_service_summary(date, uuid) from public;
revoke all on function public.admin_consumption_report(date, uuid) from public;
revoke all on function public.admin_consumption_history(uuid, text, date, integer) from public;

grant execute on function public.admin_consumption_service_summary(date, uuid) to authenticated;
grant execute on function public.admin_consumption_report(date, uuid) to authenticated;
grant execute on function public.admin_consumption_history(uuid, text, date, integer) to authenticated;


-- Importación masiva de precios desde Excel
create table if not exists public.material_price_history(
  id bigint generated by default as identity primary key,
  material_id uuid not null references public.materials(id) on delete cascade,
  sku_snapshot text,
  old_price numeric(14,2) not null check(old_price >= 0),
  new_price numeric(14,2) not null check(new_price >= 0),
  source_file text,
  source_sheet text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_material_price_history_material on public.material_price_history(material_id, changed_at desc);
create index if not exists idx_material_price_history_changed on public.material_price_history(changed_at desc);
alter table public.material_price_history enable row level security;
drop policy if exists material_price_history_admin_read on public.material_price_history;
create policy material_price_history_admin_read on public.material_price_history for select to authenticated using(public.is_admin());
revoke all on public.material_price_history from anon;
grant select on public.material_price_history to authenticated;
grant usage, select on sequence public.material_price_history_id_seq to authenticated;

create or replace function public.admin_bulk_update_material_prices(
  p_updates jsonb,
  p_source_file text default null,
  p_source_sheet text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_material public.materials%rowtype;
  v_material_id uuid;
  v_expected_sku text;
  v_expected_old_price numeric(14,2);
  v_new_price numeric(14,2);
  v_updated_count integer := 0;
  v_unchanged_count integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede actualizar precios.'; end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then raise exception 'La lista de precios a actualizar no es válida.'; end if;
  if jsonb_array_length(p_updates) < 1 then raise exception 'No se recibieron precios para actualizar.'; end if;
  if jsonb_array_length(p_updates) > 1000 then raise exception 'La actualización supera el máximo de 1000 insumos por operación.'; end if;
  if p_source_file is not null and char_length(p_source_file) > 250 then raise exception 'El nombre del archivo es demasiado extenso.'; end if;
  if p_source_sheet is not null and char_length(p_source_sheet) > 150 then raise exception 'El nombre de la hoja es demasiado extenso.'; end if;

  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    begin v_material_id := nullif(v_item->>'material_id','')::uuid;
    exception when invalid_text_representation then raise exception 'Uno de los identificadores de insumo no es válido.'; end;
    begin v_new_price := round(nullif(v_item->>'new_price','')::numeric, 2);
    exception when invalid_text_representation then raise exception 'Uno de los precios nuevos no es válido.'; end;
    begin v_expected_old_price := round(nullif(v_item->>'expected_old_price','')::numeric, 2);
    exception when invalid_text_representation then raise exception 'Uno de los precios anteriores no es válido.'; end;
    v_expected_sku := nullif(btrim(coalesce(v_item->>'sku','')), '');
    if v_material_id is null then raise exception 'Falta identificar uno de los insumos.'; end if;
    if v_new_price is null or v_new_price < 0 or v_new_price > 999999999.99 then raise exception 'Uno de los precios nuevos está fuera del rango permitido.'; end if;
    select * into v_material from public.materials where id=v_material_id for update;
    if not found then raise exception 'Uno de los insumos ya no existe. Actualizá los datos y volvé a analizar el archivo.'; end if;
    if v_expected_sku is not null and upper(btrim(coalesce(v_material.sku,''))) <> upper(v_expected_sku) then raise exception 'El SKU del insumo % cambió desde que se analizó el archivo. Volvé a analizar la lista.',v_material.name; end if;
    if v_expected_old_price is not null and abs(round(v_material.unit_price,2)-v_expected_old_price) >= 0.01 then raise exception 'El precio de % cambió desde que se analizó el archivo. Volvé a analizar la lista.',v_material.name; end if;
    if round(v_material.unit_price,2)=v_new_price then
      v_unchanged_count:=v_unchanged_count+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('material_id',v_material.id,'sku',v_material.sku,'old_price',v_material.unit_price,'new_price',v_new_price,'status','sin_cambios'));
      continue;
    end if;
    insert into public.material_price_history(material_id,sku_snapshot,old_price,new_price,source_file,source_sheet,changed_by)
    values(v_material.id,v_material.sku,round(v_material.unit_price,2),v_new_price,nullif(btrim(coalesce(p_source_file,'')),''),nullif(btrim(coalesce(p_source_sheet,'')),''),auth.uid());
    update public.materials set unit_price=v_new_price where id=v_material.id;
    v_updated_count:=v_updated_count+1;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('material_id',v_material.id,'sku',v_material.sku,'old_price',round(v_material.unit_price,2),'new_price',v_new_price,'status','actualizado'));
  end loop;
  return jsonb_build_object('updated_count',v_updated_count,'unchanged_count',v_unchanged_count,'results',v_results);
end;
$$;
revoke all on function public.admin_bulk_update_material_prices(jsonb,text,text) from public;
grant execute on function public.admin_bulk_update_material_prices(jsonb,text,text) to authenticated;
