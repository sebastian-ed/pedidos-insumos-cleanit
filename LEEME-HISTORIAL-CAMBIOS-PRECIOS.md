# Historial de cambios de precios

Esta actualización incorpora la trazabilidad visible de todos los cambios de precios del catálogo.

## Qué queda registrado

Cada vez que un administrador modifica el precio de un insumo, se guarda:

- fecha y hora;
- producto y SKU;
- precio anterior;
- precio nuevo;
- diferencia en pesos;
- variación porcentual;
- usuario que realizó el cambio;
- origen del cambio: importación desde Excel o edición manual;
- nombre del archivo y hoja del Excel, cuando corresponda.

Cuando se actualizan varios precios en una sola importación, se genera un registro independiente por cada producto. Esto permite auditar exactamente qué cambió, aunque la operación haya sido masiva.

## Dónde se consulta

Ingresar como **Administrador** y abrir:

```text
Administración → Historial
```

El historial combina:

- cambios de estado y ediciones de pedidos;
- cambios de precios.

Se puede filtrar por tipo de movimiento y buscar por pedido, servicio, producto, SKU, archivo o usuario.

## Instalación

1. Ingresar a **Supabase → SQL Editor**.
2. Ejecutar completo:

```text
actualizar-historial-cambios-precios.sql
```

3. Subir a GitHub los archivos actualizados de la aplicación.
4. Esperar la publicación de GitHub Pages.
5. Recargar con `Ctrl + F5`.

## Alcance

- Los cambios de precios realizados anteriormente desde Excel ya registrados en `material_price_history` aparecerán en el historial.
- Desde la instalación de este script también se registrarán los cambios manuales realizados desde la ficha de un insumo.
- Los pedidos existentes no se recalculan: conservan el precio histórico con el que fueron creados.
