# Corrección de scroll horizontal persistente

Esta versión corrige las tablas anchas del panel administrativo.

## Qué cambia

- Las barras horizontales nativas siguen funcionando.
- Mientras una tabla continúa por debajo de la pantalla, aparece una barra horizontal flotante en el borde inferior visible.
- La barra flotante está sincronizada con la tabla: mover cualquiera de las dos mueve la otra.
- Funciona también dentro de modales, incluyendo importación de precios, importación de facturación y comparaciones.
- Al llegar al final de la tabla desaparece la barra flotante y queda visible la barra nativa, evitando duplicados.
- Se aumentó el grosor/contraste de los scrollbars para que sean más fáciles de usar.

## Instalación

No requiere SQL ni cambios en Supabase.

Reemplazar los archivos de la app y publicar en GitHub Pages.

```powershell
git add .
git commit -m "Corregir scroll horizontal persistente"
git push origin main
```

Después del deploy realizar una recarga forzada con `Ctrl + F5`. La versión del Service Worker fue incrementada para renovar la caché de la PWA.
