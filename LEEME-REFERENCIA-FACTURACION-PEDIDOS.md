# Referencia de facturación en pedidos existentes + revisión de filas Excel

Esta actualización agrega dos controles sin cambiar el resto del flujo de la app.

## 1. Pedidos creados antes de cambiar la facturación

Cuando la facturación mensual o el porcentaje operativo de un servicio cambia, los pedidos abiertos que fueron creados con la referencia anterior quedan marcados visualmente.

En **Pedidos** aparece:

- una alerta general con la cantidad de pedidos pendientes de decidir;
- una etiqueta `Facturación cambió · revisar` en cada pedido afectado;
- la barra continúa mostrando la referencia anterior hasta que el administrador tome una decisión.

Al abrir el pedido con el ojo se muestran lado a lado:

- facturación y límites con los que se creó el pedido;
- facturación y límites actuales del servicio.

El administrador puede elegir:

- **Usar nueva facturación**: actualiza el snapshot del pedido y recalcula la barra;
- **Mantener facturación anterior**: conserva la barra original y registra esa decisión.

También existe **Usar nueva facturación en todos** para los pedidos abiertos pendientes de revisión. Los pedidos `Entregado` o `Cancelado` nunca se modifican, para conservar el histórico.

Cada decisión queda registrada en **Historial**.

### SQL obligatorio

Ejecutar una sola vez en **Supabase → SQL Editor**:

`actualizar-referencia-facturacion-pedidos.sql`

## 2. Filas del Excel que no coinciden

En **Servicios → Actualizar facturación desde Excel**, las filas amarillas (`Revisar / no encontrados`) ahora incluyen **Ver fila original del Excel**.

La vista muestra todos los campos no vacíos de esa fila, por ejemplo:

- Nombre
- Razón Social
- CUIT
- Tipo Factura
- Supervisor
- Operario
- Horas
- Valor Hora
- Subtotal

Esto permite reconocer un servicio aunque el nombre del Excel sea diferente y luego vincularlo manualmente con el desplegable.

El cálculo del 5%, límite operativo y 7% continúa realizándose exclusivamente sobre **Subtotal sin IVA**.
