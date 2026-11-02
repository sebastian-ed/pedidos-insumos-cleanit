# Pedidos Clean It — recurrencias de consumo afinadas

## Qué mejora esta versión

Se mantiene el tablero robusto de Consumos y se amplía la detección de patrones recurrentes.

La lógica anterior era demasiado restrictiva: un insumo podía dejar de aparecer como recurrente si no se había pedido justo en el mes analizado o si un durable no se había pedido tres meses consecutivos.

Ahora se analizan también:

- repeticiones no consecutivas dentro de los últimos 6 meses;
- recurrencia dentro del histórico de 12 meses;
- cantidad de meses con consumo;
- cantidad total solicitada;
- cantidad de pedidos donde apareció el insumo;
- promedio solicitado por mes activo;
- elementos durables solicitados más de una vez;
- insumos de alta frecuencia;
- cantidades altas repetidas;
- recurrencias que además vienen aumentando.

## Vista por servicio

En **Consumos → Patrones de consumo recurrente** aparece primero un resumen por servicio con los insumos que viene pidiendo reiteradamente.

Para cada servicio se muestran sus principales patrones, incluyendo meses de actividad, cantidades y pedidos. Después aparece el detalle completo de las recurrencias detectadas.

Se puede filtrar por:

- Todos los patrones.
- Solo durables.
- Cantidad alta.
- Muy frecuentes.

Un elemento durable ya no necesita aparecer tres meses consecutivos para quedar marcado. Por ejemplo, un escobillón pedido en junio, agosto y octubre queda identificado como una reposición reiterada.

## Supabase

Esta mejora no necesita una migración SQL nueva. Usa la analítica de 12 meses que ya tiene la app.

Si Consumos ya funciona sin errores de Supabase, no ejecutes ningún SQL adicional.

## Publicación

```powershell
git add .
git commit -m "Afinar recurrencias de consumo"
git push origin main
```

Después del deploy: `Ctrl + Shift + R`.

Si usás la PWA instalada, cerrala completamente y volvé a abrirla para tomar la nueva caché.
