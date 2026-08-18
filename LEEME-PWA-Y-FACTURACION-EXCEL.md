# PWA + actualización de facturación desde Excel

## Archivo analizado
La implementación fue validada contra `CleanIt_Agosto_2026.xlsx`.

Formato detectado:
- Hoja: `Prefacturación`
- Fila de encabezados: 1
- Servicio: columna `Nombre` (A)
- Base de cálculo: columna `Subtotal` (K)
- `IVA 21%` (L) y `Total` (M) NO se usan para los topes.

El archivo contiene 62 filas de servicios. La app también permite seleccionar otra hoja/encabezado/columnas si el formato cambia.

## Qué compara
Para cada servicio vinculado:
- Facturación mensual actual de la app vs Subtotal del Excel.
- 5% actual vs 5% calculado sobre el nuevo subtotal.
- Límite operativo actual (el porcentaje configurado entre 5% y 7%) vs el mismo porcentaje sobre el nuevo subtotal.
- 7% actual vs 7% calculado sobre el nuevo subtotal.

La actualización modifica únicamente `monthly_billing`. NO cambia `budget_limit_percent`.

## Seguridad de coincidencias
- Coincidencias exactas se vinculan automáticamente.
- Coincidencias difusas de alta confianza pueden vincularse automáticamente.
- Casos dudosos muestran una sugerencia y requieren elegir manualmente el servicio.
- Servicios duplicados, subtotales ilegibles y filas sin coincidencia quedan fuera de la actualización masiva.
- Un subtotal $0 con facturación actual distinta de $0 se marca para revisión y no entra en "Actualizar todos".

## Actualización
Podés:
- Actualizar una sola fila.
- Seleccionar varias y usar `Actualizar seleccionados`.
- Usar `Actualizar todos los ajustes` para aplicar únicamente diferencias seguras.

## Instalación como app (PWA)
Se agregaron:
- `manifest.webmanifest`
- `sw.js`
- iconos 180/192/512 px
- botón `Instalar app` cuando Chrome habilita la instalación.

En GitHub Pages no hace falta configurar nada adicional. Después del deploy:
1. Abrí la web con Chrome.
2. Hacé una recarga fuerte (`Ctrl + F5`) una vez.
3. Cuando Chrome detecte la PWA, aparecerá `Instalar app` en la barra superior. También puede aparecer en el menú de Chrome como `Instalar Pedidos Clean It`.

La instalación no convierte la aplicación en offline: las operaciones con Supabase siguen requiriendo conexión a internet.

## Publicación
No requiere SQL nuevo.

Reemplazá los archivos en tu repositorio y ejecutá:

```powershell
git add .
git commit -m "PWA y control de facturacion desde Excel"
git push origin main
```
