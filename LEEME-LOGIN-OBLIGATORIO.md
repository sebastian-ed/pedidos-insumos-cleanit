# Login obligatorio para Pedidos Clean It

Esta versión agrega una pantalla de acceso antes de ingresar a la aplicación.

## Cómo funciona

- **Supervisor** (`role = operator`): inicia sesión y accede al selector de servicios para cargar pedidos.
- **Administrador** (`role = admin`): inicia sesión y entra directamente al panel de administración.
- **Proveedor** (`role = supplier`): inicia sesión y entra directamente a su panel restringido.
- **Visitante sin sesión**: no puede ver servicios, insumos ni generar pedidos.

El nombre responsable del pedido se toma del perfil del usuario autenticado y no puede modificarse manualmente. Esto mejora la trazabilidad y evita que una persona cargue un pedido con el nombre de otra.

## Instalación

1. Entrar en **Supabase → SQL Editor**.
2. Ejecutar el archivo `actualizar-login-obligatorio.sql`.
3. Subir al repositorio los archivos actualizados, en especial:
   - `index.html`
   - `app.js`
   - `styles.css`
4. Esperar la publicación de GitHub Pages.
5. Abrir la app y realizar una recarga forzada con `Ctrl + F5`.

## Alta de supervisores

1. Entrar en **Supabase → Authentication → Users**.
2. Crear el usuario con correo y contraseña.
3. Entrar a la aplicación con un administrador.
4. Ir a **Usuarios** y verificar que tenga el rol **Supervisor**.
5. Completar su nombre para que quede identificado correctamente en los pedidos.

## Importante

No alcanza con mostrar un formulario de login en pantalla. El SQL también bloquea las funciones de carga para usuarios anónimos. Por eso es obligatorio ejecutar `actualizar-login-obligatorio.sql`.
