# Pedidos Clean It — corrección de analítica de consumos

## Paso obligatorio
En Supabase → SQL Editor, ejecutá **corregir-analitica-consumos.sql** completo.

Este script reemplaza las tres funciones analíticas y corrige el error:

`column reference "service_id" is ambiguous`

No modifica pedidos, servicios, consumos ni ningún dato existente.

Después no hace falta ninguna otra migración de consumos.

## Publicación
Los archivos de la app pueden subirse normalmente al repositorio y publicarse por GitHub Pages.


## Conciliación IVA múltiple

La sección Facturas → Conciliación IVA permite cargar varias facturas manualmente, asociarlas a pedidos, calcular el neto sin IVA y copiar un resumen completo. El borrador manual se guarda localmente en el navegador. Esta mejora no requiere SQL adicional.


## Exportación de conciliación IVA

La conciliación múltiple de Facturas permite ahora exportar el lote actual en PDF y XLSX. El PDF incluye resumen y detalle por factura; el XLSX contiene las hojas `Conciliación` y `Resumen`. No requiere SQL adicional.
