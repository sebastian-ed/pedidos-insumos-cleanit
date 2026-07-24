# Actualización: operario responsable y búsqueda de servicios

Esta versión separa correctamente dos datos:

- **Supervisor que carga el pedido:** se obtiene de la sesión iniciada y queda registrado automáticamente en `orders.created_by`.
- **Operario responsable del servicio:** se escribe manualmente antes de armar el pedido y se guarda en `orders.reporter_name`.

También incorpora un buscador de servicios por nombre, dirección, zona o descripción, sin eliminar el desplegable tradicional.

## Instalación

1. Ingresar a **Supabase → SQL Editor**.
2. Ejecutar completo el archivo `actualizar-operario-y-buscador-servicios.sql`.
3. Reemplazar en GitHub los archivos de esta carpeta, principalmente:
   - `index.html`
   - `app.js`
   - `styles.css`
4. Esperar la publicación de GitHub Pages.
5. Recargar la aplicación con `Ctrl + F5`.

## Funcionamiento

1. El supervisor inicia sesión con su usuario registrado.
2. Busca el servicio con la lupa o lo elige desde el desplegable.
3. Escribe el nombre y apellido del operario responsable.
4. Arma y envía el pedido.
5. En Administración se muestra por separado el operario responsable y el usuario que cargó el pedido.

No hace falta crear tablas nuevas ni modificar pedidos existentes.
