# Pedidos Clean It — tablero robusto de consumos

## Mejoras de esta versión

La sección **Consumos** incorpora una capa de análisis adicional sin eliminar las vistas existentes:

- Ranking completo de servicios, ordenado de mayor a menor gasto.
- Gasto, participación sobre el total, pedidos, gasto promedio por pedido y evolución de cada servicio.
- Ranking general de insumos consolidando el mismo SKU entre todos los servicios.
- El ranking de insumos puede ordenarse por **gasto**, **cantidad**, **cantidad de pedidos** o **cantidad de servicios que lo utilizan**.
- Gráficos de concentración para identificar rápidamente qué servicios e insumos explican la mayor parte del gasto.
- Ficha histórica de cada servicio con evolución mensual de gasto, pedidos e insumos distintos.
- Dentro de cada servicio se muestra qué productos explican el gasto del período seleccionado.
- Ficha histórica global de cada insumo, con evolución mensual de:
  - cantidad consumida;
  - gasto;
  - cantidad de pedidos;
  - cantidad de servicios que lo utilizaron;
  - variación contra el mes anterior.
- La ficha del insumo permite filtrar por un servicio específico para comparar su evolución individual.
- Ranking de los servicios que más consumen cada insumo.

Todo el tablero respeta el filtro principal de **mes**, **rango personalizado** y **servicio**.

## Supabase

Esta mejora no agrega una migración SQL nueva. Utiliza las funciones analíticas de consumo que ya tiene la app.

Si todavía no ejecutaste la corrección de analítica de consumos, ejecutá una sola vez en Supabase → SQL Editor:

`corregir-analitica-consumos.sql`

Si la sección Consumos ya carga sin errores técnicos, no hace falta volver a ejecutarlo.

## Publicación

Subí los archivos normalmente al repositorio:

```powershell
git add .
git commit -m "Mejorar tablero de consumos"
git push origin main
```

Después del deploy de GitHub Pages, hacé `Ctrl + Shift + R`. Si usás la PWA instalada, cerrala y volvé a abrirla para tomar la nueva caché.
