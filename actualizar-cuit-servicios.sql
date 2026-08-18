-- Pedidos Clean It · CUIT por servicio
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- El CUIT NO es único: un mismo CUIT puede pertenecer a más de un servicio/consorcio.

alter table public.services
  add column if not exists cuit text;

-- Guardamos únicamente dígitos. Los valores existentes quedan intactos si están vacíos.
update public.services
set cuit = nullif(regexp_replace(cuit, '[^0-9]', '', 'g'), '')
where cuit is not null;

alter table public.services drop constraint if exists services_cuit_format_check;
alter table public.services
  add constraint services_cuit_format_check
  check (cuit is null or cuit ~ '^[0-9]{11}$');

-- Índice NO único para acelerar el matching por CUIT sin impedir CUIT compartidos.
create index if not exists idx_services_cuit on public.services(cuit) where cuit is not null;

comment on column public.services.cuit is 'CUIT del cliente/servicio, normalizado a 11 dígitos. Puede repetirse entre servicios.';
