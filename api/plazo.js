// POST /api/plazo  { codigo, datos, respuestas }
// Recalcula la ficha con las respuestas de Luis (qué parte es el cliente, qué día recibió la carta)
// usando los datos ya extraídos: no vuelve a llamar a la IA.
import { construirFicha } from '../lib/ficha.js';
import { codigoValido, log } from '../lib/http.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const { codigo, datos, respuestas = {} } = req.body || {};
  if (!codigoValido(codigo)) return res.status(401).json({ error: 'Código de acceso incorrecto.' });
  if (!datos || typeof datos !== 'object' || !datos.plazo) return res.status(400).json({ error: 'Faltan los datos del documento.' });
  const r = {};
  if (['demandante', 'demandado'].includes(respuestas.cliente_es)) r.cliente_es = respuestas.cliente_es;
  if (/^\d{4}-\d{2}-\d{2}$/.test(respuestas.fecha_recepcion || '')) r.fecha_recepcion = respuestas.fecha_recepcion;
  log('recalculo', { respuestas: Object.keys(r) });
  try {
    return res.status(200).json({ ficha: construirFicha(datos, r) });
  } catch (e) {
    return res.status(400).json({ error: 'No he podido recalcular: ' + e.message });
  }
}
