# Corrección: edición en vivo de cantidades

Esta versión corrige el problema por el cual, dentro de **Editar pedido**, se podían agregar insumos pero los controles de los productos originales no respondían.

## Qué quedó corregido

- El botón **−** reduce la cantidad del insumo.
- El botón **+** aumenta la cantidad.
- La cantidad también puede escribirse directamente.
- Al modificar una cantidad se actualizan inmediatamente:
  - el subtotal del producto;
  - el total ajustado del pedido;
  - la cantidad total de unidades;
  - el margen o exceso frente al 7%;
  - la barra de avance presupuestario.
- Si al bajar una cantidad se llega a cero, el producto se quita del borrador del pedido.

## Instalación

1. Reemplazar los archivos del repositorio por los incluidos en este paquete, o reemplazar al menos `app.js`.
2. Hacer commit y push a GitHub.
3. Esperar la publicación de GitHub Pages.
4. En la aplicación, hacer una recarga forzada con `Ctrl + F5`.

No es necesario volver a ejecutar el SQL de edición de pedidos si ya fue instalado anteriormente.
