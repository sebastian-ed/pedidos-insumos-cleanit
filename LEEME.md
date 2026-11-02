# Pedidos Clean It — análisis integral de consumos

## Qué agrega

- Exportación del análisis de consumos a PDF y XLSX.
- XLSX con hojas: Resumen, Ranking servicios, Ranking insumos, Recurrencias, Detalle servicio-insumo y Evolución mensual.
- PDF gerencial con conclusiones cualitativas, KPIs, ranking completo de servicios, ranking completo de insumos y patrones recurrentes.
- Diagnóstico cuantitativo y cualitativo en pantalla.
- Concentración Top 5 de servicios e insumos, gasto promedio por pedido, mayores consumidores y recurrencias.
- Vista seleccionable: Completo, Ejecutivo, Servicios, Insumos o Recurrencias.
- El análisis respeta el período seleccionado: mes o rango personalizado, además del filtro por servicio.

## Criterio

Solo se consideran pedidos en estado Entregado. Las señales de fuga o desvío son indicadores para revisión; no se clasifican automáticamente como desperdicio sin validación operativa.

## Supabase

No requiere una migración SQL nueva si el módulo de Consumos ya funciona correctamente. Se conserva `corregir-analitica-consumos.sql` como referencia de la última corrección instalada.

## Publicación

```powershell
git add .
git commit -m "Analisis integral de consumos"
git push origin main
```

Después del deploy: `Ctrl + Shift + R`. Si usás la PWA, cerrala por completo y volvé a abrirla.
