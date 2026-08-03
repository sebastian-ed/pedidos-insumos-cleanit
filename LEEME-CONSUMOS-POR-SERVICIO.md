# Módulo de consumos por servicio

Esta actualización incorpora una sección administrativa llamada **Consumos** para analizar cuánto utiliza cada servicio de cada producto, por mes y en forma histórica.

## Criterio utilizado

La aplicación considera **consumo confirmado** únicamente a los pedidos cuyo estado sea **Entregado**.

- La fecha del consumo es la fecha en que el pedido pasó a `Entregado`.
- Los pedidos `Pendiente`, `En preparación` y `Enviado` todavía no se contabilizan.
- Los pedidos `Cancelado` se excluyen.
- Para pedidos entregados antiguos que no tengan fecha de cierre, se usa como respaldo la última actualización y, en última instancia, la fecha de creación.

Este criterio evita inflar el consumo con pedidos que todavía pueden modificarse, no llegar al servicio o cancelarse.

## Qué muestra la nueva sección

### Resumen por servicio

- Pedidos entregados durante el mes.
- Cantidad de productos distintos utilizados.
- Valor consumido durante el mes.
- Valor del mes anterior.
- Promedio de los tres meses anteriores.
- Variación frente a ese promedio.
- Valor histórico acumulado.

### Detalle por producto y servicio

- Cantidad consumida durante el mes seleccionado.
- Cantidad del mes anterior.
- Promedio de los tres meses anteriores.
- Variación porcentual.
- Cantidad y valor históricos.
- Cantidad de pedidos en los que apareció el producto.
- Histórico visual de los últimos 12 meses.

### Señales automáticas

La aplicación compara el mes seleccionado con el promedio de los tres meses calendario anteriores:

- **Alto:** más de 20% por encima del promedio.
- **Bajo:** más de 20% por debajo del promedio.
- **Habitual:** dentro de un rango de ±20%.
- **Nuevo:** existe consumo, pero todavía no hay una referencia previa suficiente.
- **Sin datos:** no existe consumo en el mes ni referencia reciente.

La señal es un indicador para investigar; no determina por sí sola que exista desperdicio. Un aumento puede responder a una limpieza extraordinaria, mayor frecuencia, cambio de dotación o compra anticipada.

## Instalación en una base existente

1. Ingresar a **Supabase → SQL Editor**.
2. Abrir el archivo:

```text
actualizar-consumos-por-servicio.sql
```

3. Ejecutarlo completo.
4. Reemplazar en GitHub los archivos de esta versión.
5. Esperar la publicación de GitHub Pages.
6. Recargar la aplicación con `Ctrl + F5`.

El script no elimina ni modifica pedidos existentes. Agrega índices y tres funciones de reporte exclusivas para administradores.

## Uso operativo recomendado

Para que el informe sea confiable, el jefe operativo debe actualizar el estado de los pedidos hasta **Entregado** cuando efectivamente hayan llegado al servicio. Si los pedidos quedan permanentemente como `Enviado`, la aplicación no puede distinguir una entrega real de una operación todavía abierta.

## Exportación

La sección permite exportar el detalle filtrado a CSV para abrirlo en Excel. El archivo respeta el mes, el servicio y el texto de búsqueda seleccionados.
