# Pedidos Clean It - actualización actual

## Cambio incluido

- Se agregó **Frecuencia del servicio** como campo independiente.
- Ejemplo: `Lunes a viernes de 8 a 16 hs.`
- Se muestra en:
  - Servicios.
  - Vista de carga del supervisor.
  - Detalle del pedido (botón del ojo).
  - Texto del botón Copiar.
  - PDF generado para el proveedor.
- La descripción del servicio queda como campo separado.

## Paso obligatorio en Supabase

Ejecutar una sola vez en **Supabase > SQL Editor**:

`actualizar-frecuencia-servicios.sql`

La migración conserva los datos anteriores: si antes se había escrito una frecuencia dentro de `Descripción o frecuencia`, la copia al nuevo campo `frequency` cuando todavía está vacío.

## Publicar

Reemplazar los archivos de la aplicación y luego:

```powershell
git add .
git commit -m "Agregar frecuencia por servicio"
git push origin main
```

Cuando GitHub Pages termine el deploy, hacer `Ctrl + Shift + R` una vez.

## Paquete depurado

Se eliminaron del ZIP las migraciones SQL históricas, instructivos viejos, respaldos de seeds y archivos de migraciones anteriores. Se conserva únicamente:

- la aplicación actual;
- assets e iconos;
- el analizador de facturas vigente de Supabase Edge Functions;
- la única migración SQL necesaria para este cambio.
