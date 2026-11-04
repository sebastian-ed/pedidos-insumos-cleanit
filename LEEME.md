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
