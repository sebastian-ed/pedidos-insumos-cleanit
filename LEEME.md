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


## Detección del número de pedido dentro de la factura

La app reconoce referencias impresas como `PEDIDO N° 000160`, `PEDIDO 160`, `NRO PEDIDO 160` o `PED-000160` y las cruza contra el código interno `PED-000160`.

Cuando la referencia coincide, la factura queda identificada visualmente como **Pedido detectado en factura** y se prioriza esa coincidencia por encima de importe, SKU o fecha. La vinculación sigue pudiéndose corregir manualmente.

### Paso obligatorio para PDFs escaneados
Esta mejora actualiza también la Edge Function `analyze-invoice`, por lo que después de subir los archivos al repositorio hay que volver a desplegarla:

```powershell
npx supabase@latest functions deploy analyze-invoice --no-verify-jwt
```

No requiere un SQL nuevo. Si el PDF tiene texto incorporado, el navegador también intenta detectar la referencia sin usar Gemini.


## Corrección carga de facturas
La detección del número de pedido impreso en la factura ya no agrega un valor nuevo a `match_method`; se conserva `automatico` y la referencia detectada se guarda en `comparison_summary`. No requiere SQL adicional.
