# Corrección definitiva de lectura de facturas PDF

## Por qué se cambió el sistema

Las facturas del proveedor pueden ser PDFs escaneados sin una capa de texto. El OCR ejecutado directamente en el navegador depende de workers/modelos externos y no resultó suficientemente confiable para este flujo.

Esta versión mantiene intacto el resto de la app y cambia únicamente la lectura de facturas difíciles:

1. Si el PDF tiene texto incorporado, la app lo lee directamente sin consumir IA.
2. Si el PDF es escaneado o la tabla no se puede estructurar, una Supabase Edge Function descarga el PDF privado y lo envía a Gemini para lectura multimodal.
3. Gemini devuelve número/fecha de factura, proveedor, CUIT, SKU, cantidades, precios, importes, subtotal, impuestos y total.
4. La app realiza después el mismo matching y comparación Pedido vs Factura que ya existía.
5. El OCR del navegador queda solamente como respaldo.

## IMPORTANTE: hay un paso nuevo de Supabase

No hay que ejecutar SQL nuevo. Sí hay que desplegar una Edge Function y configurar una clave de Gemini.

Proyecto Supabase actual: `nhxnkgxqcwgorxlzoure`

### 1. Obtener una API key de Gemini

Crear una API key en Google AI Studio. No colocar esa clave en `config.js`, GitHub ni el navegador.

### 2. Desde PowerShell, parado en la raíz del repositorio

Si todavía no usaste la CLI de Supabase:

```powershell
npx supabase@latest login
```

Vincular el proyecto:

```powershell
npx supabase@latest link --project-ref nhxnkgxqcwgorxlzoure
```

Guardar la clave como secreto del servidor:

```powershell
npx supabase@latest secrets set GEMINI_API_KEY="PEGA_ACA_TU_API_KEY"
```

Opcionalmente, se puede fijar el modelo:

```powershell
npx supabase@latest secrets set GEMINI_MODEL="gemini-2.5-flash"
```

Desplegar la función incluida en esta carpeta:

```powershell
npx supabase@latest functions deploy analyze-invoice --no-verify-jwt
```

La función usa `--no-verify-jwt` porque valida dentro del código la sesión real de Supabase y comprueba que el perfil tenga rol `admin`.

### 3. Publicar la web

```powershell
git add .
git commit -m "Lectura inteligente de facturas PDF"
git push origin main
```

Esperar que GitHub Pages termine el deploy y recargar con `Ctrl + F5`.

## Cómo probar con una factura ya cargada

1. Ingresar como Administrador.
2. Abrir `Facturas`.
3. Abrir la factura con el ojo.
4. Tocar `Reanalizar factura`.
5. La pantalla debe mostrar el progreso de lectura y luego actualizar artículos, precios, importes y comparación.

Las facturas antiguas sin texto también intentan reanalizarse automáticamente al abrirlas.

## Seguridad

- El PDF permanece en el bucket privado `supplier-invoices`.
- La API key de Gemini queda como secreto de Edge Functions y no viaja al navegador.
- La función valida la sesión del usuario y rechaza usuarios que no tengan rol `admin`.
- No se modificó ninguna tabla ni política existente.
