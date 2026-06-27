# Pedidos Clean It

Web app responsive para que los operarios soliciten insumos de manera visual por servicio. Mantiene la interfaz y la arquitectura de `stock-cleanit`: HTML, CSS, JavaScript, Bootstrap, Supabase y despliegue estático en GitHub Pages.

## Qué incluye

### Vista pública para operarios

- Acceso sin usuario ni contraseña.
- Selección de servicio y carga del nombre del operario.
- Catálogo visual con imágenes, buscador y filtro por categoría.
- Selector de cantidades con botones `+` y `−`.
- Prioridad normal o urgente.
- Observación general del pedido.
- Alta de insumos no incluidos en el catálogo, con motivo y unidad.
- Comprobante con código de pedido.

### Administración

- Login mediante Supabase Auth.
- Panel con pedidos pendientes, urgentes, ingresados hoy y en proceso.
- Filtros por servicio, estado, prioridad y búsqueda.
- Estados: Pendiente, En preparación, Enviado, Entregado y Cancelado.
- Detalle completo de cada pedido.
- Copia del pedido para WhatsApp o portapapeles.
- Gestión de insumos, imágenes, servicios y usuarios.
- Habilitación u ocultamiento de insumos por servicio, con catálogo completo por defecto.
- Historial de cambios de estado.
- Actualización en vivo mediante Supabase Realtime.

## Instalación en un proyecto nuevo de Supabase

1. Crear un proyecto nuevo en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar completo el archivo `supabase-schema.sql`.
4. Ir a **Authentication → Users** y crear el usuario administrativo.
5. Volver a **SQL Editor** y promoverlo:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador Clean It'
where email = 'TU-CORREO@DOMINIO.COM';
```

6. Abrir `config.js` y reemplazar:

```js
SUPABASE_URL: "REEMPLAZAR_CON_SUPABASE_URL",
SUPABASE_ANON_KEY: "REEMPLAZAR_CON_SUPABASE_ANON_KEY",
```

Se utilizan únicamente la **Project URL** y la clave pública **anon/publishable**. No coloques la `service_role` en una web pública: esa clave permite privilegios administrativos y nunca debe exponerse en GitHub Pages.

## Publicar en GitHub Pages

1. Crear un repositorio nuevo.
2. Subir el contenido de esta carpeta a la raíz del repositorio.
3. Abrir **Settings → Pages**.
4. Seleccionar **Deploy from a branch**.
5. Elegir la rama `main` y la carpeta `/root`.
6. Guardar.

## Archivos principales

- `index.html`: interfaz pública y administrativa.
- `styles.css`: diseño responsive basado en la app original.
- `app.js`: lógica de pedidos y administración.
- `config.js`: conexión con el nuevo proyecto Supabase.
- `supabase-schema.sql`: tablas, seguridad, RPC, Realtime, storage y datos iniciales.
- `actualizar-visibilidad-por-servicio.sql`: actualización incremental para bases ya instaladas.
- `servicios-precargados.json`: respaldo de los 64 servicios.
- `seed-materials.json`: respaldo del catálogo inicial.
- `assets/materials/`: imágenes visuales de los insumos.

## Seguridad

Los operarios no leen ni escriben directamente las tablas. La vista pública usa dos funciones RPC `security definer` que:

- exponen únicamente servicios e insumos activos;
- validan servicio, responsable, cantidades y cantidad máxima de ítems;
- crean la cabecera y el detalle del pedido;
- no permiten consultar otros pedidos, usuarios ni historial.

Las tablas administrativas están protegidas con Row Level Security y sólo son accesibles para perfiles con rol `admin`.


## Visibilidad de insumos por servicio

La aplicación permite configurar el catálogo que ve cada servicio:

- Todos los insumos activos son visibles por defecto.
- En `Administración → Servicios`, usá el botón de controles deslizantes de cada servicio.
- Desactivá únicamente los insumos que ese establecimiento no utiliza.
- Los nuevos insumos quedan automáticamente visibles en todos los servicios.
- La validación también se aplica en la base de datos: un pedido manipulado no puede incluir un insumo oculto.

### Proyecto Supabase ya instalado

Antes de publicar esta versión, ejecutá una vez:

```text
actualizar-visibilidad-por-servicio.sql
```

El script es incremental: no elimina ni modifica pedidos, servicios, materiales o imágenes existentes.

## Actualización v4 · Roles y proveedor

Esta versión incorpora un rol `Proveedor` para delegar la gestión operativa de pedidos sin entregar control total del sistema.

### Permisos por rol

| Función | Administrador | Proveedor |
|---|---:|---:|
| Ver panel general | Sí | Sí |
| Ver pedidos | Sí | Sí |
| Copiar / compartir pedidos | Sí | Sí |
| Cambiar estado de pedidos | Sí | Sí |
| Ver historial | Sí | Sí |
| Crear / editar / eliminar insumos | Sí | No |
| Cargar imágenes de insumos | Sí | No |
| Crear / editar / eliminar servicios | Sí | No |
| Configurar insumos visibles por servicio | Sí | No |
| Eliminar pedidos | Sí | No |
| Cambiar roles de usuarios | Sí | No |

### Instalación sobre un proyecto existente

Ejecutar en Supabase SQL Editor:

```sql
-- usar el archivo incluido:
-- actualizar-roles-proveedor.sql
```

Luego subir los archivos actualizados a GitHub Pages.

### Crear usuario proveedor

Por seguridad, la app no crea usuarios desde el frontend. Crear usuarios requeriría exponer la `service_role key`, lo cual sería un riesgo crítico.

Flujo recomendado:

1. Supabase → Authentication → Users → Add user.
2. Crear email y contraseña.
3. Entrar a la app como administrador.
4. Ir a Usuarios.
5. Editar el usuario y asignar rol `Proveedor`.

Alternativa rápida por SQL:

```sql
update public.profiles
set role = 'supplier', full_name = 'Proveedor'
where email = 'proveedor@dominio.com';
```
