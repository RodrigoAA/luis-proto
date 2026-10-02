// Junta lo que extrae la IA con el cálculo de plazos y limpia el mensaje al cliente.
import { calcularPlazo } from './plazos.js';

const FIRMA = process.env.FIRMA || 'Luis Bohoyo';

// Datos que nunca pueden ir en el mensaje al cliente.
const PATRONES_SENSIBLES = [
  { nombre: 'importe', re: /\d[\d.,]*\s?(?:€|euros?\b|eur\b)/gi },
  { nombre: 'DNI/NIF', re: /\b(?:\d{8}\s?-?[A-Za-z]|[XYZxyz]\d{7}[A-Za-z])\b/g },
  { nombre: 'NIG', re: /\b\d{5}\s?\d{2}\s?\d\s?\d{4}\s?\d{7}\b/g },
  { nombre: 'nº de procedimiento', re: /(?<![\d/])\d{1,6}\/(?:19|20)\d{2}(?![\d/])/g },
];

export function datosSensibles(texto = '') {
  return PATRONES_SENSIBLES.filter((p) => { p.re.lastIndex = 0; return p.re.test(texto); }).map((p) => p.nombre);
}

export function limpiarMensaje(texto = '') {
  let t = texto;
  for (const p of PATRONES_SENSIBLES) t = t.replace(p.re, '[…]');
  return t;
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaCliente(s) {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const anio = new Date().getUTCFullYear() === y ? '' : ` de ${y}`;
  return `el ${d} de ${MESES_LARGOS[m - 1]}${anio}`;
}

export function rellenar(texto, calc) {
  const f = fechaCliente(calc.vence) || 'la fecha que le confirme';
  return texto.replace(/\{FECHA_LIMITE\}/g, f).replace(/\b(de|a) el (\d)/g, (_, p, d) => `${p === 'de' ? 'del' : 'al'} ${d}`);
}

export const JERGA = ['traslado', 'se manifieste', 'estima', 'estimando', 'desestima', 'alzada', 'reposición', 'apelación', 'requerimiento', 'providencia', 'diligencia', 'decreto', 'auto', 'señalamiento', 'vista', 'días hábiles', 'personarse', 'comparecer', 'emplazamiento', 'apremio', 'a contar desde', 'desde la notificación'];
export function jergaEn(texto = '') {
  const t = texto.toLowerCase();
  return JERGA.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(t));
}

export function componerMensaje({ tratamiento, nombre_pila }, cuerpo) {
  const nombre = (nombre_pila || '').trim().split(/\s+/).slice(0, 2).join(' ');
  const saludo = tratamiento && nombre ? `${tratamiento} ${nombre}:` : 'Buenos días,';
  return `${saludo}\n${(cuerpo || '').trim()}\n\nAtentamente,\n${FIRMA}`;
}

// Elige el cuerpo según el plazo ya calculado y garantiza la fecha concreta cuando el plazo es del cliente.
export function cuerpoMensaje(datos, calculo) {
  const conPlazo = (calculo.estado === 'calculada' || calculo.estado === 'en_documento') && calculo.vence;
  if (!conPlazo) return datos.mensaje_sin_plazo || datos.mensaje_cliente || '';
  let c = (datos.mensaje_cliente || '').trim();
  if (!c.includes('{FECHA_LIMITE}')) c = `${c} Necesito que me conteste antes de {FECHA_LIMITE}.`.trim();
  return c;
}

export function construirFicha(datos, respuestas = {}) {
  const calculo = calcularPlazo(datos, respuestas);
  const sensibles = datosSensibles(cuerpoMensaje(datos, calculo));
  const avisos = [...(datos.avisos || []), ...calculo.avisos];
  if (sensibles.length) avisos.push(`He quitado del mensaje al cliente: ${sensibles.join(', ')}. Revísalo.`);
  const plantilla = componerMensaje(datos, limpiarMensaje(cuerpoMensaje(datos, calculo)));
  const jerga = jergaEn(cuerpoMensaje(datos, calculo));
  if (jerga.length) avisos.push(`El mensaje al cliente usa palabras técnicas (${jerga.join(', ')}). Revísalo.`);
  let pregunta = calculo.pregunta;
  if (!pregunta && datos.pregunta_para_luis && calculo.estado !== 'calculada' && calculo.estado !== 'en_documento') {
    pregunta = { tipo: 'nota', texto: datos.pregunta_para_luis };
  }
  return {
    tipo_documento: datos.tipo_documento,
    organismo: datos.organismo,
    procedimiento: datos.procedimiento,
    jurisdiccion: datos.jurisdiccion,
    canal: datos.canal,
    fecha_notificacion: calculo.fecha_notificacion_usada || datos.fecha_notificacion,
    motivo_fecha: datos.motivo_fecha,
    plazo: { ...datos.plazo, para_quien: calculo.para_quien },
    estado_plazo: calculo.estado,
    vence: calculo.vence,
    gracia: calculo.gracia,
    cuenta_desde: calculo.cuenta_desde,
    linea_plazo: calculo.linea,
    origen_fecha: calculo.estado === 'en_documento' ? 'en_documento' : 'calculada',
    resumen: datos.resumen,
    que_hacer: (datos.que_hacer || []).slice(0, 3).map((x) => rellenar(x, calculo)),
    pregunta,
    plantilla_mensaje: plantilla,
    mensaje_cliente: rellenar(plantilla, calculo),
    avisos: [...new Set(avisos)],
  };
}
