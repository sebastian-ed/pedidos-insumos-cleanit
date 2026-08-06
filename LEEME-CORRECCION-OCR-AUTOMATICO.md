# Corrección de lectura OCR automática

Esta versión corrige la lectura de facturas escaneadas sin capa de texto.

## Qué cambia

- Las facturas antiguas con texto vacío se releen automáticamente al abrirlas.
- Se muestra el avance del OCR dentro del detalle de la factura.
- El motor intenta dos redes CDN para evitar bloqueos o caídas puntuales.
- Se utiliza un modelo único optimizado para SKU, cantidades e importes.
- Si el OCR falla, la app muestra el motivo real en pantalla en lugar de conservar silenciosamente `No se pudo extraer texto`.

## Instalación

No ejecutar SQL. Reemplazar los archivos de la app en la raíz del repositorio, realizar commit y push, esperar el deploy de GitHub Pages y recargar con Ctrl + F5.

## Facturas ya cargadas

Abrir la factura con el botón del ojo. Si no tenía texto, el OCR comienza automáticamente. También se mantiene el botón `Releer con OCR` para repetir el proceso manualmente.
