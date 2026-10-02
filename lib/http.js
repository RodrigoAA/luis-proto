// Utilidades comunes de los endpoints: código de acceso y límite de peticiones.
import { timingSafeEqual } from 'node:crypto';

export function codigoValido(codigo) {
  const esperado = process.env.ACCESS_CODE;
  if (!esperado || typeof codigo !== 'string') return false;
  const a = Buffer.from(codigo.trim().toLowerCase());
  const b = Buffer.from(esperado.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

// Límite sencillo por IP (en memoria de cada instancia; suficiente para un prototipo).
const visitas = new Map();
export function demasiadas(req, max = Number(process.env.MAX_PETICIONES_HORA || 40)) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
  const ahora = Date.now();
  const lista = (visitas.get(ip) || []).filter((t) => ahora - t < 3600_000);
  lista.push(ahora);
  visitas.set(ip, lista);
  return lista.length > max;
}

export function log(evento, datos = {}) {
  console.log(JSON.stringify({ evento, ts: new Date().toISOString(), ...datos }));
}
