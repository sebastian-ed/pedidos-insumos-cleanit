# Actualización de precios desde Excel

Esta versión permite comparar una lista de precios nueva con el catálogo de insumos de la aplicación mediante el SKU.

## Instalación

1. Ingresar a **Supabase → SQL Editor**.
2. Ejecutar completo el archivo:

```text
actualizar-importacion-precios-excel.sql
```

3. Subir a GitHub todos los archivos actualizados de la aplicación.
4. Esperar la publicación de GitHub Pages.
5. Recargar con `Ctrl + F5`.

El script agrega una función transaccional para actualizar varios precios en una sola operación y una tabla de auditoría llamada `material_price_history`. No altera pedidos existentes ni los precios históricos congelados en `order_items`.

## Uso

1. Ingresar como **Administrador**.
2. Abrir **Insumos**.
3. Presionar **Actualizar desde Excel**.
4. Adjuntar un archivo XLSX, XLS, XLSB o CSV.
5. Revisar la hoja, la fila de encabezados y las columnas detectadas para SKU y precio.
6. Presionar **Analizar precios**.
7. Revisar aumentos, disminuciones, faltantes y duplicados.
8. Actualizar un precio individual o seleccionar varios y presionar **Actualizar seleccionados**.

## Qué detecta

- Aumentos de precio.
- Disminuciones de precio.
- Precios sin cambios.
- SKU presentes en la app que no aparecen en la lista nueva.
- SKU presentes en el archivo que no existen en la app.
- Insumos de la app sin SKU.
- Filas del archivo sin SKU.
- Precios inválidos o en cero.
- SKU duplicados con el mismo precio.
- SKU duplicados con precios diferentes.

Los precios en cero y los SKU duplicados con precios distintos no se actualizan. Deben corregirse en el archivo y volver a analizarse.

## Detección de columnas

La app intenta reconocer encabezados como:

- SKU, código, código de artículo, código de producto o referencia.
- Precio, precio unitario, precio de lista, valor, importe o costo.
- Producto, artículo, descripción, nombre o detalle.

Cuando el formato del proveedor es diferente, se pueden seleccionar manualmente la fila de encabezados y las columnas.

## Criterio de precios

La actualización cambia el `unit_price` del catálogo maestro. Por lo tanto:

- los pedidos nuevos usan el precio actualizado;
- los pedidos ya creados conservan el precio que tenían al momento de su creación;
- el descuento del 7% por retiro en Naón se sigue aplicando después, sobre el nuevo precio de lista;
- cada cambio queda registrado con precio anterior, precio nuevo, archivo, hoja, usuario y fecha.

## Seguridad operativa

- Solo el rol `admin` puede abrir y ejecutar la actualización.
- La comparación se realiza en el navegador.
- La base valida nuevamente el SKU y el precio anterior antes de guardar.
- Si otro usuario cambió un precio durante el análisis, la operación se cancela para evitar sobrescrituras silenciosas.

## Visualización en el historial

Para mostrar estos cambios dentro de **Administración → Historial** y registrar también modificaciones manuales, ejecutar además:

```text
actualizar-historial-cambios-precios.sql
```

Cada producto actualizado genera su propio movimiento con precio anterior, precio nuevo, diferencia, usuario, fecha, archivo y hoja de origen.
