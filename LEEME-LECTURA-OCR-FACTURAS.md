# Lectura OCR de facturas PDF

Esta actualización agrega lectura automática para facturas que fueron escaneadas o generadas como imágenes y, por lo tanto, no contienen texto seleccionable.

## Qué cambia

- La aplicación intenta primero leer la capa de texto normal del PDF.
- Si la lectura es insuficiente, activa OCR automáticamente.
- El OCR procesa todas las páginas y busca número de factura, fecha, proveedor, CUIT, subtotal, impuestos, total, SKU, cantidades, precios e importes.
- Los SKU detectados se contrastan contra el catálogo de la aplicación.
- Tolera errores menores de OCR en un SKU, pero evita reemplazos ambiguos.
- Si un SKU no puede asociarse con seguridad, se mantiene como artículo desconocido para revisión.
- La comparación usa el total o el subtotal de la factura, según cuál corresponda mejor con el modelo de precios del pedido. Esto evita falsos desvíos cuando la factura agrega IVA al final.

## Facturas ya cargadas

No hace falta eliminarlas ni volver a subirlas.

1. Ingresar como administrador.
2. Abrir **Facturas**.
3. Tocar el botón del ojo.
4. Presionar **Releer con OCR**.
5. Esperar a que finalice la lectura de todas las páginas.

La aplicación actualizará el texto, los artículos, los importes y la comparación contra el pedido vinculado.

## Instalación

1. Reemplazar en GitHub `index.html`, `app.js` y `styles.css` por los incluidos en esta versión.
2. Hacer commit y push sobre la rama `main`.
3. Esperar que finalice GitHub Pages.
4. Recargar con `Ctrl + F5`.

No requiere ejecutar un SQL nuevo.

## Consideraciones

- La primera lectura OCR puede tardar más porque el navegador descarga el motor y el idioma. Las siguientes lecturas reutilizan el motor durante la sesión.
- La precisión depende de la calidad del escaneo. La corrección manual continúa disponible.
- El sistema no está configurado exclusivamente para Thames: utiliza los SKU existentes en la aplicación y funciona con formatos de factura diferentes.
