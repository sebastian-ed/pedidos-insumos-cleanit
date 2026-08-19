# Corrección definitiva del scroll horizontal

Esta versión reemplaza la barra flotante inferior por una barra horizontal duplicada en la parte superior de cada tabla ancha.

## Comportamiento

- La barra aparece solo cuando la tabla realmente desborda horizontalmente.
- Queda fija (sticky) debajo de la cabecera de la app mientras se recorre verticalmente esa tabla.
- La barra superior y la barra nativa inferior están sincronizadas en ambos sentidos.
- Funciona en Pedidos, Facturas, Consumos, Insumos, Servicios, Usuarios, Historial y tablas dentro de modales/importadores.
- No requiere SQL ni cambios en Supabase.

## Publicación

Reemplazar los archivos del repositorio y ejecutar:

```powershell
git add .
git commit -m "Corregir scroll horizontal sticky"
git push origin main
```

Cuando termine GitHub Pages, cerrar y volver a abrir la PWA o hacer Ctrl+Shift+R en Chrome.

El Service Worker usa una nueva versión de caché para evitar que permanezcan app.js/styles.css anteriores.
