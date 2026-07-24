# Actualización: edición administrativa de pedidos

Esta versión incorpora la revisión operativa del contenido de cada pedido desde el panel de **Administrador**.

## Qué se agregó

- Botón **Editar pedido** dentro del detalle.
- Controles `−`, cantidad directa y `+` para cada insumo.
- Opción de quitar renglones y sumar otros insumos habilitados para el servicio.
- Recalculo inmediato de unidades, importe total, límite configurado, referencia del 7% y diferencia disponible/excedida.
- Confirmación explícita cuando el pedido se guarda por encima del límite o del 7%.
- Registro del ajuste en **Historial**.
- Protección frente a ediciones simultáneas: si otro administrador modificó el pedido, se obliga a actualizar antes de sobrescribir.

## Criterios de control aplicados

- La edición del contenido queda restringida al rol **Administrador**. El proveedor puede continuar cambiando estados, pero no alterar cantidades ni productos.
- Los pedidos `Entregado` o `Cancelado` quedan bloqueados. Para modificarlos, primero deben reabrirse cambiando su estado.
- Los renglones existentes mantienen el precio registrado al crear el pedido. Los productos nuevos toman el precio vigente del catálogo.
- Un pedido no puede guardarse vacío ni con cantidades menores o iguales a cero.

## Instalación

1. Abrir Supabase > **SQL Editor**.
2. Ejecutar completo el archivo `actualizar-edicion-pedidos.sql`.
3. Subir a GitHub los archivos actualizados de esta carpeta (`app.js`, `index.html`, `styles.css` y documentación).
4. Esperar la publicación de GitHub Pages y recargar la aplicación con `Ctrl + F5`.

No es necesario volver a cargar servicios, usuarios, materiales ni pedidos existentes.
