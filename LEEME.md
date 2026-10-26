# Pedidos Clean It - rangos e histórico de consumos

## Mejoras incluidas

### Totalizador de pedidos
Los checkbox de Pedidos siguen funcionando como selección general. La selección permite ver el valor total acumulado, copiarlo y, de forma independiente, generar el PDF para proveedor.

### Consumos por período
En Consumos se puede elegir:
- **Mensual**, manteniendo el análisis anterior.
- **Rango personalizado**, seleccionando fecha desde y fecha hasta.

También hay accesos rápidos de 2, 3, 6 y 12 meses.

El rango calcula únicamente pedidos con estado **Entregado**, según la fecha de cierre del pedido. Para el período elegido muestra gasto acumulado, pedidos, insumos utilizados, ranking de servicios, ranking de productos, evolución mensual y patrones recurrentes.

### Histórico por servicio
En el resumen por servicio aparece el botón **Histórico**. Permite consultar:
- últimos 12, 24, 36 o 60 meses;
- todo el histórico disponible;
- gasto de cada mes;
- pedidos entregados por mes;
- cantidad de insumos distintos;
- variación contra el mes anterior;
- promedio de meses con actividad y máximo mensual.

Los meses sin consumo se muestran en cero para que la comparación mes a mes sea real.

## Supabase - paso obligatorio
Ejecutar una sola vez en **Supabase > SQL Editor**:

`actualizar-rangos-historico-consumos.sql`

La migración no modifica pedidos ni registros históricos. Solo agrega funciones de lectura y consolidación para el módulo de Consumos.

## Publicar

```powershell
git add .
git commit -m "Rangos e historico de consumos"
git push origin main
```

Después del deploy de GitHub Pages, hacer `Ctrl + Shift + R`. Si la app está instalada como PWA, cerrarla completamente y volver a abrirla.
