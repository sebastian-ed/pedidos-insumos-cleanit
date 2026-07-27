# Recuperación de contraseña con Supabase

Esta versión incorpora el botón **Olvidé mi contraseña** y la pantalla para definir una nueva contraseña.

## Configuración obligatoria en Supabase

1. Abrir el proyecto de Supabase.
2. Ir a **Authentication → URL Configuration**.
3. Configurar **Site URL** con:

   `https://sebastian-ed.github.io/pedidos-insumos-cleanit/`

4. En **Redirect URLs**, agregar exactamente:

   `https://sebastian-ed.github.io/pedidos-insumos-cleanit/`

5. Guardar los cambios.

## Revisar la plantilla de correo

Ir a **Authentication → Email Templates → Reset Password**. El enlace principal debe usar `{{ .ConfirmationURL }}`. No debe contener una dirección localhost escrita manualmente.

## Publicación

Subir `index.html` y `app.js` actualizados a GitHub. No hace falta ejecutar SQL. Después de publicar, recargar con Ctrl + F5.

## Flujo final

1. El usuario escribe su correo y pulsa **Olvidé mi contraseña**.
2. Supabase envía el enlace.
3. El enlace vuelve a la app publicada en GitHub Pages.
4. La app muestra el formulario para escribir la nueva contraseña.
5. Al guardar, la sesión se cierra y el usuario puede ingresar con la nueva clave.
