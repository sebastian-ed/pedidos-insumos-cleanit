const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
});

function getServiceKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (parsed?.default) return parsed.default;
    const first = Object.values(parsed || {}).find((value) => typeof value === 'string');
    return String(first || '');
  } catch {
    return '';
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function safeText(value: unknown, max = 500) {
  return String(value ?? '').slice(0, max);
}

function buildPrompt(fileName: string, knownMaterials: any[]) {
  const catalog = knownMaterials
    .slice(0, 1500)
    .map((item) => `${safeText(item?.sku, 80)} | ${safeText(item?.name, 180)} | ${Number(item?.unitPrice || 0)}`)
    .join('\n');

  return `Analizá este PDF de una factura de proveedor para una empresa de limpieza.

OBJETIVO
Extraer de forma fiel los datos de la FACTURA y sus artículos para compararlos contra un pedido interno.
El PDF puede ser una imagen escaneada, puede contener varias páginas y también puede incluir un REMITO. Si hay factura y remito en el mismo PDF, usá los importes y cantidades de la factura y NO dupliques artículos del remito.

REGLAS IMPORTANTES
- No inventes datos. Si algo no es legible, omitilo.
- Conservá el SKU tal como aparece impreso.
- Leé cantidad, precio unitario e importe de cada renglón.
- Distingui subtotal/neto, impuestos/IVA y total fiscal.
- Si hay descuentos por línea o globales, respetá los valores impresos en la factura.
- Si un SKU parece tener un error visual de una sola letra o número, podés usar el catálogo de referencia SOLO si la coincidencia es clara. Si hay duda, conservá lo leído.
- Incluí en rawText una transcripción útil de encabezado, referencias, artículos y totales. No hace falta transcribir textos legales extensos.
- invoiceDate debe estar en formato YYYY-MM-DD cuando sea legible.
- currency debe ser ARS o USD.
- confidence es una estimación general de 0 a 100 sobre la calidad de lectura.

ARCHIVO: ${fileName}

CATÁLOGO DE REFERENCIA DE SKU (puede contener artículos que no estén en esta factura):
${catalog || 'Sin catálogo disponible'}

Devolvé únicamente el JSON solicitado por el esquema.`;
}

const responseSchema = {
  type: 'object',
  properties: {
    invoiceNumber: { type: 'string', description: 'Número de factura, por ejemplo 0016-00005501.' },
    invoiceDate: { type: 'string', description: 'Fecha en formato YYYY-MM-DD.' },
    supplierName: { type: 'string' },
    supplierTaxId: { type: 'string', description: 'CUIT del proveedor.' },
    currency: { type: 'string', enum: ['ARS', 'USD'] },
    subtotal: { type: 'number' },
    taxAmount: { type: 'number', description: 'Suma de impuestos/IVA de la factura.' },
    totalAmount: { type: 'number' },
    confidence: { type: 'number' },
    pageCount: { type: 'integer' },
    rawText: { type: 'string' },
    unmatchedLines: { type: 'array', items: { type: 'string' } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          lineTotal: { type: 'number' },
          rawLine: { type: 'string' },
        },
        required: ['sku', 'description'],
      },
    },
  },
  required: ['currency', 'items', 'rawText'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = getServiceKey();
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
    const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
    const authHeader = req.headers.get('authorization') || '';
    const clientApiKey = req.headers.get('apikey') || '';

    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, code: 'SUPABASE_CONFIG_MISSING', error: 'La función no tiene disponibles las credenciales internas de Supabase.' }, 500);
    }
    if (!geminiKey) {
      return json({ ok: false, code: 'GEMINI_KEY_MISSING', error: 'Falta configurar GEMINI_API_KEY en los secretos de Edge Functions.' }, 500);
    }
    if (!authHeader.toLowerCase().startsWith('bearer ') || !clientApiKey) {
      return json({ ok: false, error: 'Sesión no válida.' }, 401);
    }

    // Validar sesión real del usuario.
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: clientApiKey },
    });
    if (!userRes.ok) return json({ ok: false, error: 'Sesión vencida o inválida.' }, 401);
    const user = await userRes.json();
    if (!user?.id) return json({ ok: false, error: 'No se pudo identificar al usuario.' }, 401);

    // Validar rol administrador con clave de servidor.
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        Accept: 'application/json',
      },
    });
    if (!profileRes.ok) return json({ ok: false, error: 'No se pudo validar el rol del usuario.' }, 500);
    const profiles = await profileRes.json();
    if (profiles?.[0]?.role !== 'admin') return json({ ok: false, error: 'Solo el administrador puede analizar facturas.' }, 403);

    const body = await req.json();
    const bucket = safeText(body?.bucket || 'supplier-invoices', 100);
    const storagePath = safeText(body?.storagePath, 1200);
    const fileName = safeText(body?.fileName || storagePath.split('/').pop() || 'factura.pdf', 300);
    const knownMaterials = Array.isArray(body?.knownMaterials) ? body.knownMaterials : [];
    if (!bucket || !storagePath) return json({ ok: false, error: 'Falta identificar el PDF almacenado.' }, 400);

    const encodedPath = storagePath.split('/').map((part: string) => encodeURIComponent(part)).join('/');
    const storageUrl = `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
    const pdfRes = await fetch(storageUrl, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!pdfRes.ok) {
      const detail = await pdfRes.text().catch(() => '');
      return json({ ok: false, code: 'PDF_DOWNLOAD_FAILED', error: `No se pudo descargar el PDF privado desde Storage. ${detail}`.trim() }, 500);
    }
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    if (!pdfBytes.length) return json({ ok: false, error: 'El PDF está vacío.' }, 400);
    if (pdfBytes.length > 20 * 1024 * 1024) return json({ ok: false, error: 'El PDF supera el límite operativo de 20 MB de la app.' }, 413);

    const geminiPayload = {
      contents: [{
        role: 'user',
        parts: [
          { text: buildPrompt(fileName, knownMaterials) },
          { inlineData: { mimeType: 'application/pdf', data: bytesToBase64(pdfBytes) } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseFormat: {
          text: {
            mimeType: 'application/json',
            schema: responseSchema,
          },
        },
      },
    };

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify(geminiPayload),
    });

    const geminiJson = await geminiRes.json().catch(() => null);
    if (!geminiRes.ok) {
      const apiMessage = geminiJson?.error?.message || `HTTP ${geminiRes.status}`;
      return json({ ok: false, code: 'GEMINI_API_ERROR', error: `Gemini no pudo analizar el PDF: ${apiMessage}` }, 502);
    }

    const responseText = (geminiJson?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part?.text || '')
      .join('')
      .trim();
    if (!responseText) return json({ ok: false, code: 'EMPTY_AI_RESPONSE', error: 'El analizador no devolvió datos de la factura.' }, 502);

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      const cleaned = responseText.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      data = JSON.parse(cleaned);
    }

    data.pageCount = Number(data.pageCount || 0);
    data.confidence = Math.max(0, Math.min(100, Number(data.confidence || 0)));
    data.items = Array.isArray(data.items) ? data.items : [];
    data.unmatchedLines = Array.isArray(data.unmatchedLines) ? data.unmatchedLines : [];

    return json({ ok: true, model: geminiModel, data });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : 'Error inesperado al analizar la factura.' }, 500);
  }
});
