# Control de facturas de proveedor

## Instalación

1. Abrir **Supabase → SQL Editor**.
2. Ejecutar una sola vez `actualizar-control-facturas-proveedor.sql`.
3. Subir a GitHub todos los archivos actualizados de esta carpeta.
4. Esperar la publicación de GitHub Pages y recargar con `Ctrl + F5`.

No es necesario volver a ejecutar las migraciones anteriores.

## Uso

1. Ingresar como **Administrador**.
2. Abrir la nueva sección **Facturas**.
3. Adjuntar uno o varios archivos PDF.
4. La aplicación extrae el texto y busca:
   - número y fecha de factura;
   - proveedor y CUIT;
   - importe total;
   - SKU conocidos y SKU nuevos o desconocidos;
   - cantidades, precios unitarios e importes por línea.
5. La aplicación propone el pedido más probable usando:
   - número o referencia del pedido cuando aparece en el PDF;
   - coincidencia de SKU;
   - similitud del importe total;
   - cercanía de fechas;
   - nombre y dirección del servicio.
6. El administrador puede aceptar la sugerencia o vincular manualmente otro pedido.
7. El control muestra:
   - artículos correctos;
   - cantidades distintas;
   - diferencias de precio unitario;
   - diferencias de importe por línea y total;
   - artículos pedidos que no aparecen en la factura;
   - artículos facturados que no estaban en el pedido;
   - SKU desconocidos o posiblemente modificados.

## Revisión manual

Desde el detalle se puede corregir la lectura de cada línea, agregar o quitar artículos y corregir el total facturado. Después de guardar, la comparación se recalcula automáticamente.

La tolerancia monetaria utilizada es de **$1 o 0,5%**, tomando el mayor valor. Cuando el pedido tiene descuento por retiro en Naón, la app acepta que la factura muestre los precios de lista por artículo siempre que el descuento quede correctamente reflejado en el total final.

## Seguridad y alcance

- Los PDF se guardan en un bucket **privado** de Supabase y solo pueden acceder los administradores.
- Se evita cargar dos veces el mismo archivo mediante una huella digital SHA-256.
- Funciona mejor con PDF digitales que contienen texto seleccionable.
- Un PDF escaneado sin texto queda marcado como **Sin lectura**. Puede vincularse y corregirse manualmente, pero esta versión no realiza OCR.
- La comparación valida **pedido vs. factura**. Una factura coincidente no demuestra que la mercadería haya sido recibida físicamente; para eso hace falta sumar un control de recepción o remito.
- La relación implementada es una factura contra un pedido. Si el proveedor agrupa varios pedidos en una misma factura, debe revisarse manualmente.
