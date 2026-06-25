-- MIGRACIÓN DE INSUMOS: stock-cleanit -> pedidos-insumos-cleanit
-- Generado a partir de materials_rows.csv (49 insumos).
--
-- Qué hace:
-- 1) Usa slug como clave estable.
-- 2) Actualiza los insumos ya existentes y agrega los nuevos.
-- 3) Convierte target_level de la app de stock en suggested_quantity de la app de pedidos.
-- 4) Conserva image_url de los insumos que ya existen en este proyecto.
-- 5) Los insumos nuevos quedan sin imagen para que puedas cargarla desde el panel.
-- 6) No importa IDs, timestamps ni critical_level del proyecto anterior.

begin;

create temporary table import_materials_cleanit (
  slug text primary key,
  name text not null,
  category text not null,
  detail text,
  unit text not null,
  suggested_quantity numeric(12,2) not null,
  sort_order integer not null,
  active boolean not null
) on commit drop;

insert into import_materials_cleanit
  (slug, name, category, detail, unit, suggested_quantity, sort_order, active)
values
  ('blem-limpiador-de-pisos-plastificados-800-cm3-mqsjk6qx', 'Blem Limpiador de Pisos Plastificados  800 cm3', 'Químicos', 'Blem', 'unidad', 1, 100, true),
  ('rejilla-desodorante-para-mingitorio-thames-mqsjuvhj', 'Rejilla desodorante para mingitorio Thames', 'Elementos', 'Thames', 'unidad', 1, 100, true),
  ('guantes-mapa-8', 'Guantes Mapa', 'Elementos', 'Par de guantes', 'par', 1, 170, true),
  ('bolsas-verdes-70-50', 'Bolsas verdes 50x70 - Paquete x 50 Unidades', 'Bolsas', 'Paquete de bolsas de residuos color verde', 'paquete', 1, 140, true),
  ('kit-vidrios', 'Corderito + Marco lavador', 'Vidrios y altura', 'Kit para limpieza de vidrios', 'kit', 1, 100, true),
  ('bolsas-verdes-90-110', 'Bolsas verdes 90x110 - Paquete x 50 Unidades', 'Bolsas', 'Paquete de bolsas de residuos color verde', 'paquete', 1, 160, true),
  ('medidor', 'Jarra Medidora', 'Elementos', 'Para dosificación de productos', 'unidad', 1, 200, true),
  ('secuestrante-de-polvo-dust-mop-mqsjsjlh', 'Secuestrante de polvo Dust Mop', 'Químicos', 'Thames - Bidon x 5 Lts', 'unidad', 1, 100, true),
  ('secador-de-aluminio-pvc-para-vidrios-mqshnfxe', 'Secador de aluminio & pvc para vidrios', 'Vidrios y altura', 'Agarre + secador con goma', 'unidad', 1, 100, true),
  ('microfibra', 'Microfibra', 'Paños y fibras', 'Uso operativo general', 'unidad', 2, 280, true),
  ('bolsas-verdes-45-60', 'Bolsas verdes 45x60 - Paquete x 50 Unidades', 'Bolsas', 'Paquete de bolsas de residuos color verde', 'paquete', 1, 120, true),
  ('plumero-microfibra', 'Plumero microfibra', 'Utensilios', 'Para superficies y altura baja', 'unidad', 1, 320, true),
  ('fibra-verde', 'Fibra verde', 'Paños y fibras', 'Uso operativo general', 'unidad', 2, 290, true),
  ('bacter-action-herbal-mqsj184x', 'Bacter Action Herbal', 'Químicos', 'Thames - Bidon x 5 Lts', 'unidad', 1, 100, true),
  ('rapid-plus-gel', 'Lavandina en gel desinfectante', 'Químicos', 'Rapid Plus en gel - Thames · 500 ml', 'envase x 500 ml', 1, 40, true),
  ('cabo-madera-mqsh8gko', 'Cabo madera', 'Elementos', 'Thames', 'unidad', 1, 100, true),
  ('sarro-attack', 'Sarro Attack - Quitasarro', 'Químicos', 'Thames · 500 ml', 'envase x 500 ml', 1, 80, true),
  ('detergente-bio-ultra', 'Detergente ultraconcentrado', 'Químicos', 'Bio Ultra - Thames · bidón x 5 Lts', 'bidón x 5 Lts', 1, 10, true),
  ('alcohol-al70', 'Alcohol AL70', 'Químicos', 'Thames · bidón x 5 Lts · sugerido para gimnasio', 'bidón x 5 Lts', 1, 100, true),
  ('limpiametales-mqsfvd5r', 'Venus Limpiametales', 'Químicos', 'Venus 425cm3', 'unidad', 1, 100, true),
  ('rejilla', 'Rejilla', 'Paños y fibras', 'Uso operativo general', 'unidad', 2, 270, true),
  ('pulverizador-gatillo', 'Pulverizador de 1 Lt + Gatillo', 'Elementos', 'Botella pulverizadora completa', 'unidad', 2, 190, true),
  ('secador-cabo', 'Secador de piso - Corto (30 cm)', 'Utensilios', 'Thames - 30 Cm', 'unidad', 1, 250, true),
  ('perfume-flower', 'Limpiador aromatizante para pisos', 'Químicos', 'Flower - Thames · bidón x 5 Lts', 'bidón x 5 Lts', 1, 20, true),
  ('bolsas-negras-90-110', 'Bolsas negras 90x110 - Paquete x 50 Unidades', 'Bolsas', 'Paquete de bolsas de residuos color negro', 'paquete', 1, 150, true),
  ('globo-para-telaranas-mqsh5cei', 'Globo para telarañas', 'Elementos', 'Gauchita', 'unidad', 1, 100, true),
  ('steel-shine', 'Steel Shine', 'Químicos', 'Thames · 390 cm3', 'aerosol x 390 cm3', 1, 60, true),
  ('escoba-cabo', 'Escobillon Veneto', 'Utensilios', 'Thames', 'unidad', 2, 220, true),
  ('embudo-mediano', 'Embudo mediano', 'Elementos', 'Para trasvase controlado', 'unidad', 1, 210, true),
  ('lavandina-bio-lav', 'Lavandina líquida desinfectante', 'Químicos', 'Bio Lav - Thames · bidón x 5 Lts', 'bidón x 5 Lts', 1, 30, true),
  ('secador-de-piso-largo-100-cm-mqshj1a3', 'Secador de piso - Largo (100 cm)', 'Utensilios', 'Thames - 100 cm', 'unidad', 1, 100, true),
  ('cabo-metalico-mqsh2ltw', 'Cabo metálico', 'Elementos', 'Thames - 150 cm', 'unidad', 1, 100, true),
  ('desengrasante-industrial-hi-power-ultra-para-pisos-mqsjrtwy', 'Desengrasante industrial Hi Power Ultra - Para pisos', 'Químicos', 'Thames - Bidon x 5 Lts', 'unidad', 1, 100, true),
  ('pala-cabo', 'Pala + Cabo', 'Utensilios', 'Kit completo', 'unidad', 1, 240, true),
  ('escobillon-cochera', 'Escobillón largo base madera', 'Utensilios', 'Para servicios con cochera - 100 cm', 'unidad', 1, 230, true),
  ('wood-thames', 'Wood - Lustramuebles', 'Químicos', 'Thames · 360 cm3', 'envase x 360 cm3', 1, 50, true),
  ('cream-thames', 'Cream - Limpiador multiuso', 'Químicos', 'Thames · 500 ml', 'envase x 500 ml', 1, 70, true),
  ('mopa-de-barrido-de-algodon-mqsjta5u', 'Mopa de barrido de algodón', 'Paños y fibras', 'Thames', 'unidad', 1, 100, true),
  ('balde-reforzado', 'Balde reforzado', 'Elementos', '10 Lts', 'unidad', 1, 180, true),
  ('smell-thames', 'Smell - Aromatizante de ambientes', 'Químicos', 'Thames · 262 ml', 'envase x 262 ml', 3, 90, true),
  ('globo-telaranas', 'Cabo telescópico 2T x 2.00mts (4 Mts)', 'Vidrios y altura', 'Cabo telescópico 2T + 2 metros', 'unidad', 1, 100, true),
  ('jabon-liquido-de-manos-hand-cleaner-mqsjo74v', 'Jabón líquido de manos Hand Cleaner', 'Químicos', 'Thames - Bidon x 5 Lts', 'unidad', 1, 100, true),
  ('trapo-piso', 'Trapo de piso', 'Paños y fibras', 'Uso operativo general', 'unidad', 2, 260, true),
  ('esponja-amarilla', 'Esponja amarilla', 'Paños y fibras', 'Uso operativo general', 'unidad', 2, 310, true),
  ('trapo-franela-mqsj820x', 'Trapo Franela', 'Paños y fibras', 'Thames', 'unidad', 1, 100, true),
  ('bolsas-negras-70-50', 'Bolsas negras 50x70 - Paquete x 50 Unidades', 'Bolsas', 'Paquete de bolsas de residuos color negro', 'paquete', 1, 130, true),
  ('ballerina', 'Ballerina', 'Paños y fibras', 'Uso operativo general', 'unidad', 2, 330, true),
  ('esponja-acero', 'Esponja acero inoxidable', 'Paños y fibras', 'Uso operativo específico', 'unidad', 2, 300, true),
  ('bolsas-negras-45-60', 'Bolsas negras 45x60 - Paquete x 50 Unidades', 'Bolsas', 'Paquete de bolsas de residuos color negro', 'paquete', 1, 110, true);

insert into public.materials as current_material
  (slug, name, category, detail, unit, suggested_quantity, sort_order, active, image_url)
select
  imported.slug,
  imported.name,
  imported.category,
  nullif(imported.detail, ''),
  imported.unit,
  imported.suggested_quantity,
  imported.sort_order,
  imported.active,
  null
from import_materials_cleanit imported
on conflict (slug) do update
set
  name = excluded.name,
  category = excluded.category,
  detail = excluded.detail,
  unit = excluded.unit,
  suggested_quantity = excluded.suggested_quantity,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

-- OPCIONAL: desactiva cualquier insumo del proyecto nuevo que no esté en este archivo.
-- Dejé esta línea comentada para no borrar ni ocultar productos creados manualmente.
-- update public.materials
-- set active = false, updated_at = now()
-- where slug not in (select slug from import_materials_cleanit);

-- Control final esperado: 49 filas importadas/actualizadas.
select
  count(*) filter (where slug in (select slug from import_materials_cleanit)) as materiales_migrados,
  count(*) filter (where active) as materiales_activos_totales
from public.materials;

commit;
