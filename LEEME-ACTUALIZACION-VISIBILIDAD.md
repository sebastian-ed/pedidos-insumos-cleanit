# Actualización: insumos visibles por servicio

> **Compatibilidad:** esta guía corresponde a la versión anterior. En una instalación con SKU, precios y topes, no vuelvas a ejecutar `actualizar-visibilidad-por-servicio.sql`. Si lo hacés, ejecutá después `actualizar-sku-precios-topes.sql` para restaurar las funciones v5.


## 1. Actualizar Supabase

En el proyecto que ya está funcionando:

1. Abrir **Supabase → SQL Editor → New query**.
2. Copiar y ejecutar todo el contenido de `actualizar-visibilidad-por-servicio.sql`.
3. La consulta final debe devolver la cantidad de servicios, insumos activos y `exclusiones_iniciales = 0`.

No ejecutar nuevamente `supabase-schema.sql` sobre la base existente. Ese archivo completo es sólo para instalaciones nuevas.

## 2. Actualizar GitHub Pages

Subir o reemplazar los archivos de esta carpeta en el repositorio actual. Mantener en `config.js` la URL y la anon/publishable key del proyecto Supabase.

## 3. Uso

1. Ingresar como administrador.
2. Abrir **Servicios**.
3. Presionar el botón con ícono de controles deslizantes del servicio.
4. Apagar los insumos que ese servicio no debe ver.
5. Presionar **Guardar configuración**.

Todos los insumos están habilitados por defecto. Los insumos nuevos también aparecerán automáticamente en todos los servicios, salvo que luego se oculten.
