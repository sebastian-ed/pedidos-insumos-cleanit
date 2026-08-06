-- Control de facturas de proveedor contra pedidos
-- Ejecutar una sola vez en Supabase -> SQL Editor.
-- Agrega almacenamiento privado de PDFs y una tabla de análisis exclusiva para administradores.

create extension if not exists pgcrypto;

create table if not exists public.supplier_invoices(
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null unique,
  file_size bigint not null default 0 check(file_size >= 0),
  file_hash text,
  pdf_page_count integer not null default 0 check(pdf_page_count >= 0),
  extracted_text text,
  invoice_number text,
  invoice_date date,
  supplier_name text,
  supplier_tax_id text,
  currency text not null default 'ARS',
  subtotal numeric(14,2),
  tax_amount numeric(14,2),
  total_amount numeric(14,2),
  parsed_items jsonb not null default '[]'::jsonb,
  unmatched_lines jsonb not null default '[]'::jsonb,
  matched_order_id uuid references public.orders(id) on delete set null,
  match_score numeric(6,2) not null default 0,
  match_method text not null default 'automatico' check(match_method in('automatico','manual','sin_match')),
  match_candidates jsonb not null default '[]'::jsonb,
  comparison_status text not null default 'pendiente' check(comparison_status in('pendiente','coincide','diferencias','parcial','sin_match','sin_lectura')),
  comparison_summary jsonb not null default '{}'::jsonb,
  reviewed boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_supplier_invoices_hash_unique
  on public.supplier_invoices(file_hash)
  where file_hash is not null and btrim(file_hash) <> '';
create index if not exists idx_supplier_invoices_created on public.supplier_invoices(created_at desc);
create index if not exists idx_supplier_invoices_order on public.supplier_invoices(matched_order_id);
create index if not exists idx_supplier_invoices_status on public.supplier_invoices(comparison_status);

alter table public.supplier_invoices enable row level security;

drop policy if exists supplier_invoices_admin_all on public.supplier_invoices;
create policy supplier_invoices_admin_all
  on public.supplier_invoices
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.supplier_invoices from anon;
grant select,insert,update,delete on public.supplier_invoices to authenticated;

-- Mantiene updated_at y la trazabilidad de revisión.
create or replace function public.sync_supplier_invoice_review()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  new.updated_at := now();
  if new.reviewed=true and (old.reviewed is distinct from true or old.reviewed_by is distinct from new.reviewed_by) then
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif new.reviewed=false then
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_invoices_sync_review on public.supplier_invoices;
create trigger supplier_invoices_sync_review
before update on public.supplier_invoices
for each row execute function public.sync_supplier_invoice_review();

-- Bucket privado. Los PDFs no quedan públicos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('supplier-invoices','supplier-invoices',false,20971520,array['application/pdf'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Políticas del bucket: solamente administradores autenticados.
drop policy if exists supplier_invoice_files_admin_select on storage.objects;
create policy supplier_invoice_files_admin_select
  on storage.objects for select to authenticated
  using (bucket_id='supplier-invoices' and public.is_admin());

drop policy if exists supplier_invoice_files_admin_insert on storage.objects;
create policy supplier_invoice_files_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id='supplier-invoices' and public.is_admin());

drop policy if exists supplier_invoice_files_admin_update on storage.objects;
create policy supplier_invoice_files_admin_update
  on storage.objects for update to authenticated
  using (bucket_id='supplier-invoices' and public.is_admin())
  with check (bucket_id='supplier-invoices' and public.is_admin());

drop policy if exists supplier_invoice_files_admin_delete on storage.objects;
create policy supplier_invoice_files_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id='supplier-invoices' and public.is_admin());

-- Realtime opcional. Evita error si la tabla ya fue agregada.
do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='supplier_invoices'
  ) then
    alter publication supabase_realtime add table public.supplier_invoices;
  end if;
exception when undefined_object then
  null;
end $$;
