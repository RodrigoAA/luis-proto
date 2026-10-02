// Llamada a la API de OpenAI (Responses API) con salida estructurada estricta.
import { FICHA_SCHEMA, SYSTEM_PROMPT } from './schema.js';

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

export async function extraerDatos({ base64, mime, nombre = 'documento' }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('Falta OPENAI_API_KEY'), { status: 500 });
  const esPdf = mime === 'application/pdf';
  const adjunto = esPdf
    ? { type: 'input_file', filename: nombre.endsWith('.pdf') ? nombre : nombre + '.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image', image_url: `data:${mime};base64,${base64}`, detail: 'high' };
  const hoy = new Date().toISOString().slice(0, 10);
  const body = {
    model: MODEL,
    temperature: 0,
    max_output_tokens: 1800,
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'input_text', text: `Hoy es ${hoy}. ${esPdf ? 'Adjunto el PDF.' : 'Adjunto una foto o imagen del documento.'} Extrae la ficha.` },
        adjunto,
      ] },
    ],
    text: { format: { type: 'json_schema', name: 'ficha', strict: true, schema: FICHA_SCHEMA } },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 50000);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(`OpenAI: ${msg}`), { status: 502 });
  }
  const texto = json.output_text ?? json.output?.flatMap((o) => o.content || []).find((c) => c.type === 'output_text')?.text;
  const refusal = json.output?.flatMap((o) => o.content || []).find((c) => c.type === 'refusal');
  if (refusal) throw Object.assign(new Error('La IA no ha querido procesar el documento.'), { status: 422 });
  if (!texto) throw Object.assign(new Error('La IA no ha devuelto respuesta.'), { status: 502 });
  return { datos: JSON.parse(texto), uso: json.usage || null, modelo: json.model };
}
