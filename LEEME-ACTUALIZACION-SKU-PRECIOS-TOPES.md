# Actualización v5: SKU, precios y topes presupuestarios

> Esta migración ya incluye la compatibilidad con la función de insumos ocultos por servicio. No hace falta volver a ejecutar `actualizar-visibilidad-por-servicio.sql`.


Esta versión agrega un carrito valorizado y control presupuestario por servicio.

## Orden de instalación sobre la app que ya está funcionando

1. Abrí **Supabase → SQL Editor → New query**.
2. Copiá y ejecutá completo `actualizar-sku-precios-topes.sql`.
3. Verificá que la consulta final muestre las cantidades de insumos con SKU/precio y servicios con facturación. Al instalar, pueden aparecer en cero porque todavía falta completar esos datos.
4. Subí a GitHub Pages todos los archivos de esta carpeta, reemplazando los existentes.
5. Conservá el `config.js` con la URL y la clave pública del proyecto actual.
6. Recargá la app con `Ctrl + F5`.

No vuelvas a ejecutar `supabase-schema.sql` sobre una base existente. Ese archivo es únicamente para un proyecto nuevo.

## Configuración inicial

### 1. Cargar SKU y precio

1. Ingresá como administrador.
2. Abrí **Insumos**.
3. Editá cada insumo.
4. Completá:
   - **SKU**: código interno o del proveedor. No puede repetirse.
   - **Precio unitario**: precio correspondiente a la unidad de pedido indicada.
5. Guardá.

Mientras un insumo tenga precio cero, la app lo señalará como **Precio pendiente** y advertirá que el total puede estar subestimado.

### 2. Configurar facturación y límite por servicio

1. Abrí **Servicios**.
2. Editá el servicio o consorcio.
3. Cargá la **facturación mensual**.
4. Elegí el **límite operativo**, entre 5% y 7%.
5. La app mostrará automáticamente:
   - referencia del 5%;
   - valor del límite elegido;
   - referencia del 7%.
6. Guardá.

## Funcionamiento del control

- El carrito suma `cantidad × precio unitario` en tiempo real.
- Al superar el porcentaje configurado, aparece una advertencia.
- Al superar el 7%, aparece una alerta crítica.
- En ambos casos el pedido puede enviarse, porque puede existir una excepción operativa.
- El pedido queda marcado como excepción en administración.
- SKU, precio, facturación y límite quedan congelados dentro del pedido. Los cambios futuros del catálogo no modifican pedidos históricos.

## Insumos no listados

Cuando el operario agrega un insumo no listado puede indicar SKU y precio estimado. Si deja el precio en cero, el pedido puede enviarse, pero quedará advertido como total incompleto.
