// POST /api/ficha  { codigo, archivo (base64), tipo (mime), nombre }
// Devuelve { ficha, datos }: la ficha final y los datos extraídos por la IA
// (los datos se reenvían a /api/plazo para recalcular sin volver a llamar a la IA).
import { extraerDatos, MODEL } from '../lib/ia.js';
import { construirFicha } from '../lib/ficha.js';
import { codigoValido, demasiadas, log } from '../lib/http.js';

const MAX_BYTES = 3.2 * 1024 * 1024; // Vercel limita el cuerpo a 4,5 MB; en base64 ocupa un 33 % más.
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const { codigo, archivo, tipo, nombre } = req.body || {};
  if (!codigoValido(codigo)) return res.status(401).json({ error: 'Código de acceso incorrecto.' });
  if (demasiadas(req)) return res.status(429).json({ error: 'Demasiadas peticiones en la última hora. Prueba más tarde.' });
  if (typeof archivo !== 'string' || !archivo) return res.status(400).json({ error: 'No ha llegado ningún archivo.' });
  if (!TIPOS.includes(tipo)) return res.status(415).json({ error: 'Solo puedo leer PDF o fotos (JPG, PNG, WEBP).' });
  const base64 = archivo.replace(/^data:[^,]+,/, '');
  const bytes = Math.floor(base64.length * 3 / 4);
  if (bytes > MAX_BYTES) return res.status(413).json({ error: 'El archivo es demasiado grande (máx. 3 MB). Si es una foto, hazla con menos resolución.' });

  const esFoto = tipo !== 'application/pdf';
  log('documento_recibido', { tipo: esFoto ? 'foto' : 'pdf', mime: tipo, bytes });
  const t0 = Date.now();
  try {
    const { datos, uso } = await extraerDatos({ base64, mime: tipo, nombre: String(nombre || 'documento').slice(0, 100) });
    log('ia_ok', { tipo: esFoto ? 'foto' : 'pdf', modelo: MODEL, ms: Date.now() - t0, tokens_in: uso?.input_tokens, tokens_out: uso?.output_tokens, legible: datos.texto_legible, canal: datos.canal });
    if (!datos.texto_legible) {
      if (esFoto) log('foto_ilegible', {});
      return res.status(422).json({ error: esFoto
        ? 'No consigo leer bien esta foto. Hazla con más luz y de frente, o reenvíame el PDF de LexNET o de la DEHú si lo tienes.'
        : 'No consigo leer texto en este documento. ¿Es una notificación? Prueba con el PDF original de LexNET o de la DEHú.' });
    }
    return res.status(200).json({ ficha: construirFicha(datos), datos });
  } catch (e) {
    log('error', { mensaje: e.message, ms: Date.now() - t0 });
    return res.status(e.status || 500).json({ error: e.name === 'AbortError' ? 'La IA ha tardado demasiado. Prueba otra vez.' : 'No he podido leer el documento: ' + e.message });
  }
}
