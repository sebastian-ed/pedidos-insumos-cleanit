# Actualización: retiro en Naón con 7% de descuento

Esta versión parte de **pedidos-insumos-cleanit-recuperacion-contrasena.zip**. La versión posterior de corrección del límite de correos fue descartada, tal como se solicitó.

## Qué cambia

En **Administración > Pedidos > Ver pedido > Editar pedido**, el administrador dispone de una casilla:

**Retiro en Naón**

- Viene marcada por defecto porque es la modalidad habitual.
- Marcada: aplica un 7% de descuento sobre el precio unitario de cada insumo.
- Desmarcada: mantiene el precio de lista porque el pedido se entrega directamente en el servicio.
- El subtotal de cada producto, el total final, el margen frente al 7% y la barra presupuestaria cambian inmediatamente.
- La modalidad y el descuento se guardan con el pedido y quedan visibles en el detalle, el texto copiado y WhatsApp.

El supervisor no ve ni puede modificar esta opción.

## Instalación

1. Ingresar a **Supabase > SQL Editor**.
2. Ejecutar completo el archivo:

   `actualizar-descuento-naon.sql`

3. Subir a GitHub los archivos de esta carpeta.
4. Esperar la publicación de GitHub Pages.
5. Recargar la aplicación con `Ctrl + F5`.

## Criterio aplicado a pedidos anteriores

Los pedidos creados antes de esta actualización quedan con la modalidad pendiente de definición. Cuando el administrador los edita por primera vez, la casilla aparece marcada por defecto. El descuento se aplica y se guarda únicamente al presionar **Guardar pedido**.

## Estructura de precios

La base conserva dos valores por renglón:

- Precio de lista: valor original del producto.
- Precio aplicado: precio final, con o sin descuento.

Esto permite marcar o desmarcar Naón en futuras ediciones sin perder el precio original.
