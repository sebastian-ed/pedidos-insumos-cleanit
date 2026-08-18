# CUIT por servicio + matching de facturación

## Instalación

1. En Supabase → SQL Editor ejecutá una sola vez:
   `actualizar-cuit-servicios.sql`
2. Subí los archivos actualizados de esta carpeta al repositorio de GitHub.
3. Hacé el deploy normal de GitHub Pages y recargá la PWA/web con `Ctrl + F5`.

## Qué cambia

- En Administración → Servicios podés cargar o editar el CUIT de cada servicio.
- El CUIT se guarda normalizado a 11 dígitos, aunque lo escribas con guiones.
- Un CUIT puede repetirse: la base no lo bloquea porque puede haber varios consorcios/servicios con el mismo titular.
- Cuando un CUIT está repetido, la app muestra una alerta visual tanto en la lista de Servicios como al editar.
- El importador de facturación detecta automáticamente la columna `CUIT` del Excel.
- Prioridad de matching: CUIT único → nombre/dirección → sugerencia manual.
- Si un CUIT corresponde a más de un servicio, la app no elige a ciegas: avisa y pide revisar/vincular manualmente.
- Si el CUIT del Excel y el CUIT del servicio se contradicen, el caso queda en revisión aunque el nombre se parezca.

## Formato del Excel de referencia

La hoja `Prefacturación` del archivo usado como ejemplo contiene `Nombre`, `Razón Social`, `CUIT`, `Subtotal`, `IVA 21%` y `Total`. El control presupuestario sigue usando exclusivamente `Subtotal` sin IVA.

En el archivo de agosto hay CUIT repetidos válidos, por ejemplo MOLYSIL y dos servicios de Olaguer y Feliú. Por eso el CUIT funciona como identificador fuerte, pero no como clave única.
