# PDF múltiple de pedidos

Esta actualización agrega selección múltiple en **Administrador > Pedidos** para generar un único PDF para el proveedor.

## Uso

1. Entrar a **Pedidos**.
2. Marcar con el checkbox los pedidos que se quieren incluir.
3. Se pueden usar los filtros actuales y seguir sumando pedidos a la selección.
4. También se puede marcar el checkbox de la cabecera para seleccionar todos los pedidos visibles según los filtros.
5. Presionar **Generar PDF**.

La descarga contiene un único archivo PDF. Cada pedido comienza en una página nueva. Si un pedido tiene demasiados insumos para una sola hoja A4, continúa automáticamente en una segunda página antes de comenzar el pedido siguiente.

El PDF incluye la misma información operativa disponible al copiar el pedido: servicio, dirección, operario responsable, fecha, prioridad, estado, modalidad de entrega/retiro, SKU, cantidades, precios, importes, descuento de Naón cuando corresponde, total, control presupuestario y observaciones.

## Instalación

No requiere SQL ni cambios en Supabase. Reemplazar los archivos de la aplicación, publicar en GitHub Pages y hacer una recarga forzada (`Ctrl + Shift + R`) una vez finalizado el deploy.
