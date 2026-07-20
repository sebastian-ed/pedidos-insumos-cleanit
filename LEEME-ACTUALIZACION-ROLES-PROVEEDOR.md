# Actualización: roles y acceso proveedor

Esta actualización permite que un proveedor ingrese al panel operativo sin permisos destructivos.

## Qué puede hacer el proveedor

- Ver panel general.
- Ver todos los pedidos.
- Abrir el detalle del pedido.
- Copiar o compartir el pedido.
- Cambiar estado: pendiente, en preparación, enviado, entregado o cancelado.
- Ver historial de cambios.

## Qué no puede hacer el proveedor

- Crear, editar, activar/desactivar o eliminar insumos.
- Cargar imágenes de insumos.
- Crear, editar, activar/desactivar o eliminar servicios.
- Configurar insumos visibles por servicio.
- Eliminar pedidos.
- Cambiar roles de usuarios.
- Promover usuarios.

## Instalación sobre la versión actual

1. Entrá a Supabase.
2. Abrí `SQL Editor`.
3. Ejecutá completo el archivo `actualizar-roles-proveedor.sql`.
4. Subí esta versión de la app a GitHub Pages.
5. Conservá o reemplazá en `config.js` tu Project URL y tu anon key.

## Cómo crear un proveedor

Por seguridad, esta app estática no crea usuarios directamente. Crear usuarios desde el frontend exigiría exponer la `service_role key`, y eso no debe hacerse.

Flujo correcto:

1. Supabase → Authentication → Users → Add user.
2. Crear el usuario con email y contraseña.
3. Entrar a la app como administrador.
4. Ir a `Usuarios`.
5. Editar el usuario.
6. Rol: `Proveedor`.
7. Guardar.

Alternativa por SQL:

```sql
update public.profiles
set role = 'supplier', full_name = 'Nombre del proveedor'
where email = 'proveedor@dominio.com';
```

## Nota de seguridad

Los permisos están aplicados en dos capas:

- Interfaz: el proveedor no ve módulos ni botones que no le corresponden.
- Supabase/RLS: aunque manipule el navegador, no puede escribir ni borrar datos maestros.
