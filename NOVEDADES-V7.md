# Clean It Pedidos · V7 – Hallazgos investigables

Partiendo de la V6, el módulo Consumos incorpora un panel de auditoría interactivo:

- Pareto de servicios: grupo mínimo que llega a >=80 % del gasto confirmado, gasto individual, participación y acumulado, pedidos y acceso al histórico.
- Pareto de insumos: desglose de SKU por importe, cantidad, pedidos, participación acumulada y acceso a evolución histórica.
- Hallazgos prioritarios: botón **Investigar hallazgo** en cada resultado, incluyendo prioridades, aumentos, recurrencias, durables y semidurables.
- Alertas operativas: **Investigar** abre el servicio/insumo detrás de cada señal, sin alterar el filtro del reporte.
- Exportar CSV del desglose de cada investigación.

## Límites del dato

Solo usa consumos confirmados y fuentes ya disponibles en el análisis. La base de esta versión mantiene historial agregado por insumo y servicio, no reconstruye la lista de pedidos individuales en meses históricos sin sus registros originales. Los patrones y score son señales para revisar, no conclusiones de mal uso. La proyección de pedidos abiertos sigue en Analytics Studio y no entra en estos Pareto de consumo confirmado.

## Instalación

Descomprimir y publicar todo el contenido. Sin SQL adicional. Cambia identificador de cache/PWA y URLs de recursos. Probar en Consumos → Vista completa o ejecutiva → Hallazgos prioritarios.
