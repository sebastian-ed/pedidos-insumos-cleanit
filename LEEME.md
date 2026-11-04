# Pedidos Clean It — inteligencia avanzada de consumos

## Qué incorpora

- análisis por mes o rango personalizado;
- ranking completo de servicios e insumos;
- gráficos de gasto, pedidos, frecuencia y evolución;
- score de prioridad de revisión 0–100 por servicio;
- comparación del consumo contra facturación mensual y límite operativo;
- Pareto 80/20 para focalizar controles;
- clasificación automática Consumible / Semidurable / Durable;
- recurrencias y reposiciones potencialmente anómalas;
- explorador individual por servicio con gasto, pedidos y desagregado mensual por insumo;
- explorador individual por insumo con cantidad, gasto y precio efectivo mes a mes;
- separación aproximada del efecto cantidad y efecto precio sobre el gasto;
- exportaciones PDF, XLSX y CSV. El XLSX incluye una hoja de Prioridad de auditoría.

Solo se consideran pedidos en estado **Entregado**. Las alertas indican qué conviene revisar; no afirman automáticamente que exista desperdicio.

## Supabase — paso necesario

Ejecutá una vez `consumos-supabase.sql` desde **Supabase > SQL Editor**. El archivo usa `CREATE OR REPLACE`: actualiza las funciones analíticas sin borrar pedidos ni datos. La nueva función `admin_consumption_overview` permite contar pedidos mensuales de forma exacta, sin duplicarlos por cada línea de insumo.

La app sigue cargando si esa función todavía no fue instalada, pero los gráficos históricos de cantidad de pedidos exactos requieren este SQL.

## Publicación

```powershell
git add .
git commit -m "Inteligencia avanzada de consumos"
git push origin main
```

Después del deploy hacé `Ctrl + Shift + R`. Si usás la PWA, cerrala completamente y volvé a abrirla.


## Analytics Studio de consumos
La sección Consumos incluye un explorador visual multidimensional para cruzar período, servicio, insumo, clasificación y métrica (gasto, cantidad, precio efectivo y pedidos). Permite comparar series, usar índice base 100, ver una matriz mes a mes y saltar desde alertas recurrentes al gráfico correspondiente.

### SQL requerido para conteos exactos
Volvé a ejecutar `consumos-supabase.sql` en Supabase → SQL Editor. La versión actual amplía `admin_consumption_range_bundle` con `monthly_services` y `monthly_total`, necesarios para contar pedidos sin duplicarlos cuando se comparan servicios. No modifica pedidos ni borra datos.


## Corrección Analytics Studio · render
- Corrige un bloqueo donde Supabase devolvía datos pero el Studio no dibujaba las series porque el render se ejecutaba mientras el estado `loading` seguía activo.
- Prioriza `admin_consumption_range_bundle` para evitar el límite de 1.000 filas de PostgREST en históricos amplios.
- No requiere SQL adicional si ya se ejecutó `consumos-supabase.sql` de la versión anterior.


## Analytics Studio: proyección y límites
- Por defecto Analytics Studio sigue mostrando solo consumos confirmados (pedidos Entregados).
- El switch **Mostrar proyección de pedidos abiertos** incorpora únicamente pedidos Pendientes, En preparación y Enviados como escenario proyectado; Cancelados quedan excluidos.
- La línea continua representa consumo confirmado y la línea punteada representa **confirmado + proyección**. La proyección no altera los históricos ni las RPC de consumos.
- El bloque **Control de límites de pedidos** clasifica cada pedido con las mismas referencias presupuestarias guardadas en el pedido: dentro del límite, sobre límite operativo, sobre 7% o sin configurar.
- El control de límites usa el mes de creación del pedido para mostrar recurrencia operativa.
- Esta versión no requiere un SQL adicional: utiliza pedidos e ítems que la administración ya carga en la app.

## Corrección de insumos por servicio

Si al activar/desactivar insumos en **Administración → Servicios** aparece el mensaje de configuración actualizada pero al volver a abrir el servicio todos figuran activos, ejecutá una vez `fix-service-materials.sql` en **Supabase → SQL Editor**.

La app ahora también valida contra `service_material_exclusions` que los cambios hayan quedado realmente persistidos. Si la RPC no actualiza la tabla, intenta una reparación directa y, si Supabase la bloquea por permisos/RLS, muestra un error explícito en lugar de un falso mensaje de éxito.

Después de publicar esta versión, hacé `Ctrl + Shift + R`. Si usás la PWA, cerrala por completo y volvé a abrirla para tomar el nuevo service worker.
