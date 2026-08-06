# Pedidos Clean It

Web app responsive para que los supervisores autorizados soliciten insumos de manera visual por servicio. Mantiene la interfaz y la arquitectura de `stock-cleanit`: HTML, CSS, JavaScript, Bootstrap, Supabase y despliegue estático en GitHub Pages.

## Qué incluye

### Carga de pedidos para supervisores

- Login obligatorio mediante Supabase Auth.
- Acceso únicamente para perfiles con rol `operator`, mostrado como **Supervisor**.
- Selección de servicio y carga manual del operario responsable; el supervisor autenticado queda registrado automáticamente como creador del pedido.
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
- Historial unificado de pedidos y cambios de precios.
- Actualización en vivo mediante Supabase Realtime.

## Instalación en un proyecto nuevo de Supabase

1. Crear un proyecto nuevo en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar completo el archivo `supabase-schema.sql`.
4. Ir a **Authentication → Users** y crear el usuario administrativo. Los supervisores también deben crearse allí.
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

Los visitantes anónimos no pueden consultar el catálogo ni crear pedidos. Los supervisores autenticados usan dos funciones RPC `security definer` que:

- exponen únicamente servicios e insumos activos;
- validan el rol Supervisor, el servicio, las cantidades y la cantidad máxima de ítems;
- validan el operario informado y registran por separado al supervisor autenticado que generó el pedido;
- crean la cabecera y el detalle del pedido;
- no permiten consultar otros pedidos, usuarios ni historial.

Las tablas administrativas están protegidas con Row Level Security. El administrador conserva acceso total y el proveedor sólo accede a las funciones operativas habilitadas.


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
| Ver análisis de consumos | Sí | No |
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

## Actualización v5 · SKU, precios y control presupuestario

La versión v5 agrega:

- SKU único y precio unitario en cada insumo.
- Carrito con subtotal por producto y total del pedido en tiempo real.
- Facturación mensual por servicio.
- Límite operativo configurable entre 5% y 7% de la facturación.
- Referencias automáticas del 5% y del 7%.
- Advertencia al superar el límite y alerta crítica al superar el 7%.
- Envío excepcional permitido aunque se supere el tope.
- Registro histórico de SKU, precio, total y situación presupuestaria de cada pedido.

Para actualizar una instalación existente, ejecutar:

```text
actualizar-sku-precios-topes.sql
```

Después, reemplazar los archivos publicados en GitHub Pages. Las instrucciones completas están en `LEEME-ACTUALIZACION-SKU-PRECIOS-TOPES.md`.


## Edición administrativa de pedidos

Para habilitar la modificación de productos y cantidades desde el detalle de un pedido, ejecutar `actualizar-edicion-pedidos.sql`. Ver instrucciones en `LEEME-ACTUALIZACION-EDICION-PEDIDOS.md`.

## Actualización v7 · Login obligatorio

Esta versión elimina la carga anónima de pedidos.

- `operator` se muestra en la interfaz como **Supervisor**.
- Los supervisores ingresan con correo y contraseña y acceden al formulario de pedidos.
- Administradores y proveedores ingresan desde la misma pantalla y son dirigidos automáticamente a sus paneles.
- El supervisor escribe el operario responsable del servicio; la cuenta autenticada queda registrada por separado como creadora del pedido.
- Las funciones antiguas de carga anónima quedan bloqueadas en Supabase.

Para una instalación existente, ejecutar en último lugar:

```text
actualizar-login-obligatorio.sql
```

Luego reemplazar `index.html`, `app.js` y `styles.css`. Las instrucciones están en `LEEME-LOGIN-OBLIGATORIO.md`.


## Actualización: descuento por retiro en Naón

El administrador puede definir desde la edición del pedido si el proveedor entrega en Naón. La opción viene marcada por defecto y aplica un 7% de descuento por precio unitario, recalculando en tiempo real subtotales, total y control presupuestario. Para instalarla, ejecutar `actualizar-descuento-naon.sql`.

## Actualización: barras presupuestarias visibles

Se agregó un termómetro presupuestario por pedido en el listado administrativo y un panel completo en la vista de detalle. Ambos se recalculan después de guardar una edición. Ver `LEEME-BARRAS-PRESUPUESTARIAS.md`.

## Actualización: consumos por servicio

Se agregó la sección administrativa **Consumos**, que consolida únicamente pedidos `Entregado` y permite analizar:

- consumo mensual de cada producto por servicio;
- mes anterior y promedio de los tres meses previos;
- variaciones y señales de consumo alto, bajo, habitual o nuevo;
- histórico acumulado y detalle visual de los últimos 12 meses;
- exportación del reporte filtrado a CSV.

Para una instalación existente, ejecutar:

```text
actualizar-consumos-por-servicio.sql
```

Las definiciones, criterios e instrucciones están en `LEEME-CONSUMOS-POR-SERVICIO.md`.

## Actualización: listas de precios desde Excel

En **Administración → Insumos** se agregó la opción **Actualizar desde Excel**. Permite adjuntar XLSX, XLS, XLSB o CSV, detectar las columnas de SKU y precio, comparar con el catálogo y actualizar cambios de forma individual o masiva.

La comparación identifica aumentos, disminuciones, precios sin cambios, SKU faltantes en cualquiera de los dos lados, insumos sin SKU, filas inválidas y duplicados. Para una base existente, ejecutar:

```text
actualizar-importacion-precios-excel.sql
```

Las instrucciones completas están en `LEEME-IMPORTACION-PRECIOS-EXCEL.md`.

## Actualización: historial de cambios de precios

La sección **Historial** ahora muestra, además de los movimientos de pedidos, cada variación del catálogo de precios con producto, SKU, precio anterior, precio nuevo, diferencia, porcentaje, fecha, usuario y origen del cambio.

La auditoría contempla tanto las actualizaciones masivas desde Excel como las ediciones manuales del precio de un insumo. Para una base existente, ejecutar:

```text
actualizar-historial-cambios-precios.sql
```

Las instrucciones completas están en `LEEME-HISTORIAL-CAMBIOS-PRECIOS.md`.


## Control de facturas de proveedor

El administrador puede adjuntar una o varias facturas PDF desde la pestaña **Facturas**. La aplicación extrae número, fecha, proveedor, CUIT, importe total, SKU, cantidades y precios; propone el pedido más probable y compara artículos e importes. También señala SKU desconocidos, faltantes, extras y diferencias de cantidad o precio.

El pedido sugerido puede reemplazarse manualmente y la lectura de las líneas puede corregirse desde el detalle. Los PDF se guardan en un bucket privado de Supabase. Para habilitar el módulo en una base existente, ejecutar una vez `actualizar-control-facturas-proveedor.sql`.

Los PDF escaneados sin texto seleccionable requieren corrección manual. La comparación valida pedido contra factura; la recepción física debe controlarse mediante remito o confirmación de entrega.
