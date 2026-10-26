# Pedidos Clean It — corrección de analítica de consumos

## Paso obligatorio
En Supabase → SQL Editor, ejecutá **corregir-analitica-consumos.sql** completo.

Este script reemplaza las tres funciones analíticas y corrige el error:

`column reference "service_id" is ambiguous`

No modifica pedidos, servicios, consumos ni ningún dato existente.

Después no hace falta ninguna otra migración de consumos.

## Publicación
Los archivos de la app pueden subirse normalmente al repositorio y publicarse por GitHub Pages.
