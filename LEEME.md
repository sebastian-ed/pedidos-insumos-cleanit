# Pedidos Clean It - actualización actual

## Cambio incluido

Se agregó trazabilidad visible de los cambios de estado del pedido.

Cuando un pedido pasa, por ejemplo, de **Pendiente** a **En preparación**, **Enviado**, **Entregado** o **Cancelado**:

- la fecha y hora siguen quedando registradas en `order_status_history`;
- el movimiento aparece en **Historial** con estado anterior, estado nuevo, fecha/hora y usuario;
- dentro del botón del **ojo** aparece **Último cambio de estado**;
- dentro del mismo detalle aparece un bloque **Historial de estados** con toda la secuencia del pedido, fecha/hora y usuario que realizó cada cambio;
- después de guardar un estado, el modal permanece abierto y actualiza la trazabilidad inmediatamente.

## Supabase

**No hay que ejecutar ningún SQL nuevo para esta actualización.**

La aplicación ya utiliza la tabla `order_status_history` y el trigger de auditoría instalados en las versiones anteriores.

## Publicar

Reemplazar los archivos de la aplicación y ejecutar:

```powershell
git add .
git commit -m "Registrar fechas de cambios de estado"
git push origin main
```

Cuando termine el deploy de GitHub Pages, hacer `Ctrl + Shift + R` una vez. Si la aplicación está instalada como PWA, cerrarla y volver a abrirla para tomar la nueva versión del Service Worker.
