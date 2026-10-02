// Pasa los 6 documentos de ejemplo por la IA + el cálculo de plazos y compara con fichas/fichas-referencia.json.
// Uso: OPENAI_API_KEY=... node scripts/eval.mjs   (opcional: --cache para reutilizar la última respuesta de la IA)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { extraerDatos, MODEL } from '../lib/ia.js';
import { construirFicha, datosSensibles, jergaEn } from '../lib/ficha.js';

const REF = JSON.parse(readFileSync(new URL('../fichas/fichas-referencia.json', import.meta.url)));
// Cuerpo del mensaje sin saludo ni firma.
const cuerpo = (m = '') => m.split('\n').slice(1, -3).join(' ');
const usarCache = process.argv.includes('--cache');
const CACHE = new URL('../.eval-cache/', import.meta.url);
if (!existsSync(CACHE)) mkdirSync(CACHE);

const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/n\.?\s?º|nº|num\.?|numero/g, 'n').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['de', 'del', 'la', 'el', 'los', 'las', 'y'].includes(w));
const parecido = (ref, ia) => { const r = norm(ref.split('(')[0]); const i = new Set(norm(ia)); return r.length ? r.filter((w) => i.has(w)).length / r.length >= 0.6 : true; };

let tokIn = 0, tokOut = 0;
const filas = [];
const trampas = [];
for (const ref of REF) {
  const ruta = new URL(`../docs/${ref.doc}.pdf`, import.meta.url);
  const cacheFile = new URL(`${ref.doc}.json`, CACHE);
  let datos;
  if (usarCache && existsSync(cacheFile)) datos = JSON.parse(readFileSync(cacheFile));
  else {
    const r = await extraerDatos({ base64: readFileSync(ruta).toString('base64'), mime: 'application/pdf', nombre: `${ref.doc}.pdf` });
    datos = r.datos; tokIn += r.uso?.input_tokens || 0; tokOut += r.uso?.output_tokens || 0;
    writeFileSync(cacheFile, JSON.stringify(datos, null, 2));
  }
  const f = construirFicha(datos);
  const esDiligencia = ref.doc.startsWith('01');
  // En la diligencia la referencia trae el plazo "si el cliente es demandante": comprobamos que pregunta y que, al responder, sale bien.
  const fCalc = esDiligencia ? construirFicha(datos, { cliente_es: 'demandante' }) : f;
  const quienEsperado = esDiligencia ? 'desconocido' : ref.plazo.para_quien;
  const sens = datosSensibles(datos.mensaje_cliente);
  const fila = {
    doc: ref.doc.slice(0, 2),
    tipo: parecido(ref.tipo_documento, datos.tipo_documento),
    organismo: parecido(ref.organismo.split('·').pop(), datos.organismo),
    notificacion: (f.fecha_notificacion || null) === ref.fecha_notificacion,
    vence: (fCalc.vence || null) === ref.vence,
    gracia: (fCalc.gracia || null) === ref.gracia,
    para_quien: f.plazo.para_quien === quienEsperado,
    msg_limpio_ia: sens.length === 0,
    msg_final_limpio: datosSensibles(f.mensaje_cliente).length === 0,
    // Mensaje al cliente tal como lo verá Luis (salida final, no la de la IA).
    msg_fecha: !(fCalc.estado_plazo === 'calculada' || fCalc.estado_plazo === 'en_documento') || /antes del? \d{1,2} de [a-z]+/.test(fCalc.mensaje_cliente),
    msg_sin_jerga: [f, fCalc, construirFicha(datos, { cliente_es: 'demandado' })].every((x) => jergaEn(cuerpo(x.mensaje_cliente)).length === 0),
    saludo_pila: (!datos.nombre_pila || datos.nombre_pila.trim().split(/\s+/).length <= 2) && (!['tributaria', 'seguridad_social'].includes(datos.jurisdiccion) || /^Estimad[oa] /.test(f.mensaje_cliente)),
    msg_cambia: !esDiligencia || (construirFicha(datos, { cliente_es: 'demandante' }).mensaje_cliente !== construirFicha(datos, { cliente_es: 'demandado' }).mensaje_cliente && construirFicha(datos, { para_quien: 'cliente' }).mensaje_cliente !== construirFicha(datos, { para_quien: 'otra_parte' }).mensaje_cliente),
  };
  filas.push(fila);
  const detalle = { doc: ref.doc, ia: { tipo: datos.tipo_documento, organismo: datos.organismo, fecha_notificacion: datos.fecha_notificacion, plazo: datos.plazo, fecha_limite_en_documento: datos.fecha_limite_en_documento, canal: datos.canal }, ficha: { estado: f.estado_plazo, vence: fCalc.vence, gracia: fCalc.gracia, linea: fCalc.linea_plazo, pregunta: f.pregunta?.texto, mensaje: f.mensaje_cliente, que_hacer: f.que_hacer, avisos: f.avisos } };
  if (process.argv.includes('-v')) console.log(JSON.stringify(detalle, null, 2));
  if (esDiligencia) trampas.push(['1. Diligencia: el plazo puede ser de la otra parte → pregunta antes de calcular', f.estado_plazo === 'pregunta' && f.pregunta?.tipo === 'parte' && construirFicha(datos, { cliente_es: 'demandado' }).estado_plazo === 'sin_plazo' && fCalc.vence === '2026-10-06']);
  if (ref.doc.startsWith('02')) trampas.push(['2. Decreto: el 12 oct es festivo y la gracia pasa al 13', f.gracia === '2026-10-13 15:00']);
  if (ref.doc.startsWith('03')) trampas.push(['3. Sentencia: los 20 días cruzan el 12 oct → 29 oct', f.vence === '2026-10-29']);
  if (ref.doc.startsWith('04')) trampas.push(['4. AEAT: cuenta desde el acceso (1/10), no la puesta a disposición (29/9)', f.fecha_notificacion === '2026-10-01' && f.vence === '2026-10-16']);
  if (ref.doc.startsWith('05')) trampas.push(['5. TGSS: la fecha viene en el documento, no se calcula', f.estado_plazo === 'en_documento' && f.vence === '2026-11-30']);
  if (ref.doc.startsWith('06')) trampas.push(['(extra) Email procurador: cliente demandado → sin plazo propio', f.estado_plazo === 'sin_plazo']);
}

const ok = (b) => (b ? '✔' : '✘');
const cols = Object.keys(filas[0]);
console.log(`\nModelo: ${MODEL}${usarCache ? ' (respuestas en caché)' : ''}\n`);
console.log(cols.map((c) => c.padEnd(13)).join(''));
for (const f of filas) console.log(cols.map((c) => (c === 'doc' ? f[c] : ok(f[c])).padEnd(13)).join(''));
const total = filas.reduce((a, f) => a + cols.slice(1).filter((c) => f[c]).length, 0);
console.log(`\nAciertos: ${total}/${filas.length * (cols.length - 1)}\n\nTrampas:`);
for (const [t, b] of trampas) console.log(`${ok(b)} ${t}`);
if (tokIn) {
  const coste = (tokIn * 0.4 + tokOut * 1.6) / 1e6; // precios gpt-4.1-mini por millón de tokens
  console.log(`\nTokens: ${tokIn} de entrada, ${tokOut} de salida ≈ ${coste.toFixed(4)} $ (precio gpt-4.1-mini)`);
}
