# Pedidos Clean It - totalizador y analítica de consumos

## 1. Totalizador de pedidos

Los mismos checkbox de **Pedidos** ahora tienen dos funciones independientes:

- muestran automáticamente la cantidad de pedidos seleccionados y su **valor total acumulado**;
- permiten, de forma opcional e independiente, generar el PDF para el proveedor.

Si la selección incluye pedidos cancelados, la app muestra una advertencia visual para evitar incluirlos por error en una conciliación con la factura del proveedor.

## 2. Consumos - tablero operativo

Se amplió el módulo de Consumos con:

- evolución de gasto de los últimos 12 meses;
- comparación del mes contra el promedio de los 3 meses anteriores;
- ranking de servicios con mayor gasto;
- ranking de insumos con mayor gasto;
- alertas de servicios con aumento fuerte de gasto;
- alertas de crecimiento sostenido durante varios meses;
- alertas de aumentos fuertes por SKU/insumo;
- detección de reposición reiterada de elementos durables como escobas, baldes, mopas, cabos, palas, secadores, pulverizadores, cepillos, plumeros, carros, etc.;
- bloque de **Patrones de consumo recurrente**: muestra servicio + insumo + cantidad acumulada + meses con consumo durante los últimos 6 meses;
- lectura ejecutiva automática para señalar rápidamente dónde conviene revisar.

Los cálculos continúan usando únicamente pedidos con estado **Entregado**.

## 3. Supabase - paso obligatorio

Ejecutar una sola vez en **Supabase > SQL Editor** el archivo:

`actualizar-analitica-consumos.sql`

La función solo lee y consolida consumos históricos. No modifica pedidos ni registros existentes.

## 4. Publicar

Reemplazar los archivos del repositorio y ejecutar:

```powershell
git add .
git commit -m "Totalizador y analitica avanzada de consumos"
git push origin main
```

Después del deploy de GitHub Pages, hacer `Ctrl + Shift + R`. Si la app está instalada como PWA, cerrarla completamente y volver a abrirla.
