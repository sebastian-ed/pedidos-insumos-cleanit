-- Clean It · Frecuencia por servicio
-- Ejecutar UNA sola vez en Supabase > SQL Editor.

alter table public.services
  add column if not exists frequency text;

-- La versión anterior usaba "Descripción o frecuencia" en un único campo.
-- Para no perder información ya cargada, copiamos ese contenido a Frecuencia
-- únicamente cuando todavía no existe una frecuencia específica.
update public.services
set frequency = nullif(btrim(description), '')
where frequency is null
  and description is not null
  and btrim(description) <> '';

comment on column public.services.frequency is
  'Frecuencia/horario operativo del servicio. Ej.: Lunes a viernes de 8 a 16 hs.';
