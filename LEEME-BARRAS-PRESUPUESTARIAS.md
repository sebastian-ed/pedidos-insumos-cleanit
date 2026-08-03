# Barras presupuestarias en Pedidos

Esta versión incorpora el control visual del presupuesto en dos lugares adicionales del panel administrativo:

1. **Listado de Pedidos**
   - Cada pedido muestra una barra compacta debajo del importe.
   - La barra representa el consumo respecto de la referencia máxima del 7%.
   - La línea vertical marca el límite operativo configurado para el servicio.

2. **Detalle del pedido (botón del ojo)**
   - El control presupuestario se muestra apenas se abre el pedido, antes de entrar en edición.
   - Incluye total actual, límite operativo, referencia máxima del 7%, porcentaje utilizado y margen o exceso.

## Código visual

- **Verde:** dentro del límite operativo.
- **Amarillo:** supera el límite operativo, pero permanece dentro del 7%.
- **Rojo:** supera la referencia máxima del 7%.
- **Gris:** el servicio no tiene facturación mensual configurada.

Cuando el administrador edita un pedido y guarda los cambios, el listado y el detalle se actualizan con los nuevos importes y porcentajes.

## Instalación

No requiere ejecutar SQL.

1. Reemplazar los archivos del repositorio por los incluidos en esta carpeta.
2. Subir los cambios a GitHub.
3. Esperar la publicación de GitHub Pages.
4. Recargar la aplicación con `Ctrl + F5`.
