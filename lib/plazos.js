// Cálculo determinista de plazos según reglas-plazos.md.
// La IA solo extrae datos; aquí se calcula la fecha límite.
import { readFileSync } from 'node:fs';

const FESTIVOS = JSON.parse(readFileSync(new URL('../data/festivos.json', import.meta.url), 'utf8'));

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// --- utilidades de fechas (todo en UTC, formato AAAA-MM-DD) ---
const toDate = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s) => toDate(s).getUTCDay();
export const bonita = (s) => { if (!s) return ''; const d = toDate(s); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
export const bonitaLarga = (s) => { if (!s) return ''; const d = toDate(s); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function normalizaMunicipio(m) {
  if (!m) return null;
  return m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Devuelve el nombre del festivo o null. Anota en `avisos` si falta el calendario de ese año o municipio.
function festivo(s, municipio, avisos) {
  const year = s.slice(0, 4);
  const cal = FESTIVOS[year];
  if (!cal) { avisos.add(`No tengo cargados los festivos de ${year}: revisa el plazo a mano.`); return null; }
  const c = cal.comunes.dias.find((x) => x.fecha === s);
  if (c) return c.nombre;
  const muni = normalizaMunicipio(municipio);
  if (muni) {
    const loc = cal.locales[muni];
    if (!loc) avisos.add(`No tengo los festivos locales de ${municipio}: comprueba que no haya ninguno en el plazo.`);
    else {
      if (!loc.dias.length || String(loc.estado).startsWith('pendiente')) avisos.add(`Festivos locales de ${municipio} ${year} pendientes de verificar.`);
      const l = loc.dias.find((x) => x.fecha === s);
      if (l) return l.nombre;
    }
  } else {
    avisos.add('No sé el municipio del órgano: no he podido aplicar festivos locales.');
  }
  return null;
}

// ¿Por qué es inhábil un día? null si es hábil.
export function motivoInhabil(s, { jurisdiccion, esPenal = false, municipio = null }, avisos = new Set()) {
  const w = dow(s);
  if (w === 0 || w === 6) return w === 6 ? 'sábado' : 'domingo';
  const f = festivo(s, municipio, avisos);
  if (f) return `festivo: ${f}`;
  if (jurisdiccion === 'judicial') {
    const [, mm, dd] = s.split('-').map(Number);
    if (mm === 8) return 'agosto';
    if (!esPenal && ((mm === 12 && dd >= 24) || (mm === 1 && dd <= 6))) return 'Navidad (24 dic–6 ene)';
  }
  return null;
}

const siguienteHabil = (s, ctx, avisos, saltados) => {
  let d = s;
  for (let i = 0; i < 400; i++) {
    const m = motivoInhabil(d, ctx, avisos);
    if (!m) return d;
    saltados?.push({ fecha: d, motivo: m });
    d = addDays(d, 1);
  }
  throw new Error('No encuentro día hábil');
};

function resumenSaltados(saltados) {
  if (!saltados.length) return 'ninguno';
  const fines = saltados.filter((x) => x.motivo === 'sábado' || x.motivo === 'domingo').length;
  const agosto = saltados.filter((x) => x.motivo === 'agosto').length;
  const navidad = saltados.filter((x) => x.motivo.startsWith('Navidad')).length;
  const fest = saltados.filter((x) => x.motivo.startsWith('festivo'));
  const partes = [];
  if (fines) partes.push(`${fines} días de fin de semana`);
  fest.forEach((x) => partes.push(`${bonita(x.fecha)} (${x.motivo.replace('festivo: ', '')}, festivo)`));
  if (agosto) partes.push('agosto (inhábil en los juzgados)');
  if (navidad) partes.push(`${navidad} días de Navidad (24 dic–6 ene)`);
  return partes.join(', ');
}

/**
 * datos: lo que extrae la IA (ficha-schema), más opcionalmente las respuestas de Luis:
 *   respuestas.cliente_es: 'demandante' | 'demandado'
 *   respuestas.fecha_recepcion: 'AAAA-MM-DD' (para cartas en papel)
 * Devuelve { estado, vence, gracia, cuenta_desde, fecha_notificacion_usada, linea, saltados, avisos, pregunta }
 * estado: 'calculada' | 'en_documento' | 'sin_plazo' | 'pregunta'
 */
export function calcularPlazo(datos, respuestas = {}) {
  const avisos = new Set();
  const plazo = datos.plazo || {};
  const ctx = { jurisdiccion: datos.jurisdiccion, esPenal: !!datos.es_penal, municipio: datos.municipio_organo };
  const out = { estado: null, vence: null, gracia: null, cuenta_desde: null, fecha_notificacion_usada: null, linea: null, saltados: [], avisos: [], pregunta: null };
  const fin = () => { out.avisos = [...avisos]; return out; };

  // 1) ¿Para quién es el plazo?
  let paraQuien = plazo.para_quien;
  const parte = plazo.parte_con_plazo;
  // Si el plazo es solo de una parte, decide el código según qué parte es el cliente,
  // y si no consta en el documento, se pregunta (no nos fiamos de que la IA lo suponga).
  if (!respuestas.cliente_es && ['demandante', 'demandado'].includes(parte) && datos.cliente_es !== undefined) {
    paraQuien = ['demandante', 'demandado'].includes(datos.cliente_es) ? (datos.cliente_es === parte ? 'cliente' : 'otra_parte') : 'desconocido';
  }
  // Plazo para ambas partes o para el destinatario de una carta: es del cliente.
  if (['ambas', 'destinatario'].includes(parte) && paraQuien === 'desconocido') paraQuien = 'cliente';
  if (respuestas.cliente_es) {
    paraQuien = (parte === 'ambas' || parte === respuestas.cliente_es) ? 'cliente' : 'otra_parte';
    if (!['demandante', 'demandado', 'ambas'].includes(parte)) paraQuien = 'cliente';
  }
  out.para_quien = paraQuien;

  // 2) Fecha que trae el propio documento: no se calcula.
  if (esFecha(datos.fecha_limite_en_documento) && paraQuien !== 'otra_parte') {
    out.estado = 'en_documento';
    out.vence = datos.fecha_limite_en_documento;
    out.linea = 'La fecha viene en el propio documento; no se recalcula.';
    return fin();
  }

  if (paraQuien === 'desconocido') {
    out.estado = 'pregunta';
    out.pregunta = { tipo: 'parte', texto: '¿Tu cliente es el demandante o el demandado?', opciones: ['demandante', 'demandado'] };
    out.linea = `El plazo es de la parte ${parte && parte !== 'no_aplica' ? parte : 'que indica el documento'}: no lo calculo hasta saber qué parte es tu cliente.`;
    return fin();
  }
  if (paraQuien === 'otra_parte') {
    out.estado = 'sin_plazo';
    out.linea = `El plazo es de la otra parte${parte && parte !== 'no_aplica' ? ` (${parte})` : ''}: tu cliente no tiene plazo propio.`;
    return fin();
  }
  if (plazo.unidad === 'sin plazo propio' || !plazo.dias) {
    out.estado = 'sin_plazo';
    out.linea = 'El documento no abre ningún plazo para tu cliente.';
    return fin();
  }

  // 3) Fecha de notificación
  let notif = esFecha(respuestas.fecha_recepcion) ? respuestas.fecha_recepcion : datos.fecha_notificacion;
  let origenNotif = esFecha(respuestas.fecha_recepcion) ? 'el día que nos dices que la recibió el cliente' : 'la fecha de acceso que figura en el documento';
  if (!esFecha(notif) && esFecha(datos.fecha_puesta_disposicion)) {
    if (datos.canal === 'lexnet') {
      // Si no se abre en 3 días hábiles, se da por notificada al terminar el tercero.
      let d = datos.fecha_puesta_disposicion, n = 0;
      while (n < 3) { d = addDays(d, 1); if (!motivoInhabil(d, ctx, avisos)) n++; }
      notif = d; origenNotif = 'notificación presunta: 3 días hábiles desde la puesta a disposición en LexNET sin abrirla';
      avisos.add('No consta la fecha de acceso: uso la notificación presunta de LexNET. Confírmala.');
    } else if (datos.canal === 'dehu') {
      notif = addDays(datos.fecha_puesta_disposicion, 10);
      origenNotif = 'rechazo presunto: 10 días naturales desde la puesta a disposición en la DEHú sin abrirla';
      avisos.add('No consta la fecha de acceso: uso el rechazo presunto de la DEHú (10 días naturales). Confírmalo.');
    }
  }
  if (!esFecha(notif)) {
    out.estado = 'pregunta';
    out.pregunta = { tipo: 'fecha', texto: '¿Qué día la recibió el cliente? (el del acuse de recibo o el de recogida en Correos)' };
    out.linea = 'En una carta en papel la fecha que cuenta no está en el documento: necesito el día en que la recibió el cliente.';
    return fin();
  }
  out.fecha_notificacion_usada = notif;

  const judicial = datos.jurisdiccion === 'judicial';
  const saltados = [];
  let vence;
  if (plazo.unidad === 'hábiles') {
    let d = notif, n = 0;
    while (n < plazo.dias) {
      d = addDays(d, 1);
      const m = motivoInhabil(d, ctx, avisos);
      if (m) { saltados.push({ fecha: d, motivo: m }); continue; }
      if (n === 0) out.cuenta_desde = d;
      n++;
    }
    vence = d;
  } else if (plazo.unidad === 'naturales') {
    out.cuenta_desde = addDays(notif, 1);
    vence = addDays(notif, plazo.dias);
    if (motivoInhabil(vence, ctx, avisos)) vence = siguienteHabil(vence, ctx, avisos, saltados);
  } else if (plazo.unidad === 'meses') {
    out.cuenta_desde = addDays(notif, 1);
    const n = toDate(notif);
    const y = n.getUTCFullYear(), m = n.getUTCMonth() + plazo.dias, day = n.getUTCDate();
    const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    vence = iso(new Date(Date.UTC(y, m, Math.min(day, ultimo))));
    if (motivoInhabil(vence, ctx, avisos)) vence = siguienteHabil(vence, ctx, avisos, saltados);
  } else {
    out.estado = 'pregunta';
    out.pregunta = { tipo: 'nota', texto: 'No he entendido la unidad del plazo: revísalo a mano.' };
    return fin();
  }
  out.vence = vence;
  out.saltados = saltados;
  out.estado = 'calculada';

  let gracia = null, saltadosGracia = [];
  if (judicial) {
    const g = siguienteHabil(addDays(vence, 1), ctx, avisos, saltadosGracia);
    gracia = g + ' 15:00';
    out.gracia = gracia;
  }

  const desdeTxt = out.cuenta_desde === addDays(notif, 1)
    ? `Se cuenta desde el ${bonita(out.cuenta_desde)}, día siguiente a la notificación del ${bonita(notif)} (${origenNotif}).`
    : `Se cuenta desde el ${bonita(out.cuenta_desde)}, primer día hábil tras la notificación del ${bonita(notif)} (${origenNotif}).`;
  const tipo = judicial ? 'hábiles judiciales' : 'hábiles administrativos';
  let linea = `${plazo.dias} ${plazo.unidad === 'hábiles' ? 'días ' + tipo : plazo.unidad === 'meses' ? (plazo.dias === 1 ? 'mes' : 'meses') : 'días naturales'}. ${desdeTxt} Se han saltado: ${resumenSaltados(saltados)}.`;
  if (gracia) {
    const fg = saltadosGracia.filter((x) => x.motivo.startsWith('festivo'));
    linea += ` Día de gracia: hasta las 15:00 del ${bonita(gracia.slice(0, 10))}${fg.length ? ` (el ${fg.map((x) => bonita(x.fecha)).join(', ')} es festivo)` : ''}.`;
  } else {
    linea += ' Sin día de gracia.';
  }
  out.linea = linea;
  const festivosCruzados = [...saltados, ...saltadosGracia].filter((x) => x.motivo.startsWith('festivo'));
  festivosCruzados.forEach((x) => avisos.add(`El ${bonita(x.fecha)} es festivo (${x.motivo.replace('festivo: ', '')}) y mueve el plazo.`));
  return fin();
}
