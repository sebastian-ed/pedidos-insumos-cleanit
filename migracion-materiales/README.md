# Migración de materiales

Se procesaron **49 insumos** desde `materials_rows.csv`.

## Método recomendado: SQL

1. Abrí el proyecto nuevo de Supabase.
2. Entrá en **SQL Editor**.
3. Creá una consulta nueva.
4. Pegá el contenido de `cargar_materiales_supabase.sql`.
5. Ejecutá **Run**.
6. Revisá la consulta de control al final: debe informar 49 materiales migrados.
7. Volvé a la app y recargá la página.

El script actualiza por `slug`, evita duplicados, conserva las imágenes que ya tenga el proyecto nuevo y deja sin imagen únicamente los productos nuevos.

## Alternativa: CSV

`materials_import_nueva_app.csv` ya tiene las columnas de la app nueva. Usalo sólo si la tabla `materials` está vacía. Si ya cargaste el esquema inicial, el método SQL es mejor porque varios `slug` ya existen.

## Mapeo realizado

- `target_level` → `suggested_quantity`
- `critical_level` → no se importa
- `id` → no se importa
- `image_url` → no se importa desde el proyecto viejo
- `created_at` / `updated_at` → los administra el proyecto nuevo
