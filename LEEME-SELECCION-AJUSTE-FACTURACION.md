# Selección manual de una fila para actualizar facturación

Esta versión corrige los casos donde dos o más filas del Excel terminan vinculadas al mismo servicio (por ejemplo, porque comparten CUIT).

## Nuevo comportamiento

- Las filas ambiguas siguen marcadas en amarillo y quedan excluidas de **Actualizar todos los ajustes**.
- Cada fila que tenga un servicio vinculado y un subtotal legible muestra ahora un checkbox y el botón **Usar esta fila**.
- El administrador puede seleccionar explícitamente la fila correcta y ejecutar **Actualizar seleccionados**.
- Si se marca una fila para un servicio, cualquier otra fila seleccionada que apunte al mismo servicio se desmarca automáticamente.
- También se puede usar directamente **Usar esta fila** para actualizar solo ese servicio.
- Antes de aplicar una fila ambigua se pide confirmación mostrando el servicio y el subtotal que se utilizará.
- El porcentaje operativo del servicio no cambia; solo se actualiza la facturación mensual base con el Subtotal sin IVA del Excel.

No requiere SQL ni cambios en Supabase.
