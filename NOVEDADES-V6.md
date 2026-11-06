# Clean It Pedidos · V6 – Auditoría de consumo mensual

Esta versión parte de la V3 (persistencia de activación/desactivación de insumos) y agrega mejoras a **Consumos → Analytics Studio**.

## Cambios

- Zoom temporal en el gráfico de líneas: 3, 6, 12 meses o período completo, flechas para recorrer meses y expansión vertical.
- Clic sobre un punto de una serie por servicio: abre el auditor mensual con el servicio y el mes identificados.
- Radar global de todos los servicios: compara el último mes con el anterior, mostrando confirmado, pedidos abiertos y escenario total.
- Botón **Auditar** por servicio para investigar rápidamente sus variaciones.
- Comparador de dos meses con cantidades, importes, diferencias y pedidos abiertos por insumo.
- Detalle de artículos para pedidos abiertos disponibles en memoria y exportación CSV del comparador.

## Datos y alcance

- Confirmado: histórico agregado desde los RPC de consumos existentes. No se reconstruyen pedidos históricos individuales que la fuente no entrega.
- Proyección: pedidos `pendiente`, `preparacion` y `enviado`, fecha de creación del pedido, no fecha de futura entrega. El radar suma importes del pedido; el comparador suma artículos disponibles en memoria.
- Los pedidos descargados para el radar provienen del límite de los 1.000 pedidos más recientes que carga la aplicación. Por ello una ausencia de pedidos abiertos antiguos no prueba que no existan.
- El último mes puede estar incompleto. Una diferencia temporal no es prueba de sobreconsumo ni de un problema de gestión.
- No hay migración de SQL adicional para esta versión. Conservar las funciones Supabase de la versión V3.

## Publicación

Subir la carpeta descomprimida o su contenido a Netlify/GitHub. El `sw.js` lleva un identificador de caché nuevo y `app.js` tiene versión de URL nueva. Recargar luego de publicar.

## Validación

1. Ir a Consumos → Vista de análisis → Analítica visual.
2. En Analytics Studio seleccionar 12 meses, activar proyección y presionar Aplicar período.
3. Elegir “Todos” en series, probar zoom y expansión.
4. En el radar pulsar Auditar sobre un servicio; comparar dos meses y exportar CSV.
5. Validar el detalle contra un pedido abierto real.

