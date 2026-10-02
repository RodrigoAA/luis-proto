import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlazo, motivoInhabil } from '../lib/plazos.js';

const judicial = (o) => ({ jurisdiccion: 'judicial', canal: 'lexnet', es_penal: false, fecha_limite_en_documento: null, fecha_puesta_disposicion: null, ...o });

test('12 de octubre de 2026 es festivo nacional', () => {
  assert.match(motivoInhabil('2026-10-12', { jurisdiccion: 'tributaria', municipio: 'Cáceres' }), /Fiesta Nacional/);
});

test('Doc 1 diligencia: sin saber la parte, pregunta y no calcula', () => {
  const d = judicial({ fecha_notificacion: '2026-10-01', municipio_organo: 'Cáceres', plazo: { dias: 3, unidad: 'hábiles', para_quien: 'desconocido', parte_con_plazo: 'demandante' } });
  const r = calcularPlazo(d);
  assert.equal(r.estado, 'pregunta');
  assert.equal(r.vence, null);
  const dem = calcularPlazo(d, { cliente_es: 'demandante' });
  assert.equal(dem.vence, '2026-10-06');
  assert.equal(dem.gracia, '2026-10-07 15:00');
  assert.equal(dem.cuenta_desde, '2026-10-02');
  assert.equal(calcularPlazo(d, { cliente_es: 'demandado' }).estado, 'sin_plazo');
});

test('Doc 2 decreto: el 12 oct mueve el día de gracia al 13', () => {
  const r = calcularPlazo(judicial({ fecha_notificacion: '2026-10-02', municipio_organo: 'Plasencia', plazo: { dias: 5, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'ambas' } }));
  assert.equal(r.cuenta_desde, '2026-10-05');
  assert.equal(r.vence, '2026-10-09');
  assert.equal(r.gracia, '2026-10-13 15:00');
});

test('Doc 3 sentencia: 20 días cruzando el 12 oct', () => {
  const r = calcularPlazo(judicial({ fecha_notificacion: '2026-09-30', municipio_organo: 'Cáceres', plazo: { dias: 20, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'ambas' } }));
  assert.equal(r.vence, '2026-10-29');
  assert.equal(r.gracia, '2026-10-30 15:00');
  assert.match(r.linea, /12 oct/);
});

test('Doc 4 AEAT: cuenta desde el acceso, sin gracia', () => {
  const r = calcularPlazo({ jurisdiccion: 'tributaria', canal: 'dehu', fecha_notificacion: '2026-10-01', fecha_puesta_disposicion: '2026-09-29', municipio_organo: 'Cáceres', fecha_limite_en_documento: null, plazo: { dias: 10, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'destinatario' } });
  assert.equal(r.vence, '2026-10-16');
  assert.equal(r.gracia, null);
});

test('DEHú sin acceso: rechazo presunto a los 10 días naturales', () => {
  const r = calcularPlazo({ jurisdiccion: 'tributaria', canal: 'dehu', fecha_notificacion: null, fecha_puesta_disposicion: '2026-09-29', municipio_organo: 'Cáceres', fecha_limite_en_documento: null, plazo: { dias: 10, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'destinatario' } });
  assert.equal(r.fecha_notificacion_usada, '2026-10-09');
});

test('Doc 5 TGSS: fecha en el documento, no se calcula', () => {
  const r = calcularPlazo({ jurisdiccion: 'seguridad_social', canal: 'sede_electronica', fecha_notificacion: '2026-10-01', fecha_limite_en_documento: '2026-11-30', municipio_organo: 'Cáceres', plazo: { dias: null, unidad: 'sin plazo propio', para_quien: 'cliente', parte_con_plazo: 'destinatario' } });
  assert.equal(r.estado, 'en_documento');
  assert.equal(r.vence, '2026-11-30');
});

test('Doc 6 email: plazo de la otra parte', () => {
  const r = calcularPlazo(judicial({ fecha_notificacion: '2026-10-01', municipio_organo: 'Cáceres', plazo: { dias: 3, unidad: 'hábiles', para_quien: 'otra_parte', parte_con_plazo: 'demandante' } }));
  assert.equal(r.estado, 'sin_plazo');
  assert.equal(r.vence, null);
});

test('Carta en papel sin fecha: pregunta qué día la recibió', () => {
  const d = { jurisdiccion: 'tributaria', canal: 'papel', fecha_notificacion: null, fecha_puesta_disposicion: null, municipio_organo: 'Cáceres', fecha_limite_en_documento: null, plazo: { dias: 10, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'destinatario' } };
  assert.equal(calcularPlazo(d).pregunta.tipo, 'fecha');
  assert.equal(calcularPlazo(d, { fecha_recepcion: '2026-10-01' }).vence, '2026-10-16');
});

test('Agosto inhábil en juzgados, hábil en Hacienda', () => {
  const base = { fecha_notificacion: '2026-07-30', municipio_organo: 'Cáceres', fecha_limite_en_documento: null, plazo: { dias: 3, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'ambas' } };
  assert.equal(calcularPlazo({ ...base, jurisdiccion: 'judicial' }).vence, '2026-09-02');
  assert.equal(calcularPlazo({ ...base, jurisdiccion: 'tributaria' }).vence, '2026-08-04');
});

test('Navidad inhábil salvo en penal', () => {
  const base = { jurisdiccion: 'judicial', fecha_notificacion: '2026-12-22', municipio_organo: 'Cáceres', fecha_limite_en_documento: null, plazo: { dias: 2, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'ambas' } };
  assert.equal(calcularPlazo(base).vence, '2027-01-07');
  assert.equal(calcularPlazo({ ...base, es_penal: true }).vence, '2026-12-24');
});

test('Meses: un mes desde el 31 de enero vence el último día de febrero (o siguiente hábil)', () => {
  const r = calcularPlazo({ jurisdiccion: 'seguridad_social', fecha_notificacion: '2027-01-31', municipio_organo: 'Cáceres', fecha_limite_en_documento: null, plazo: { dias: 1, unidad: 'meses', para_quien: 'cliente', parte_con_plazo: 'destinatario' } });
  assert.equal(r.vence, '2027-03-01'); // 28 feb 2027 es domingo
});

test('Si la IA supone que el cliente es el demandante pero el documento no lo dice, se pregunta', () => {
  const r = calcularPlazo(judicial({ cliente_es: 'no_consta', fecha_notificacion: '2026-10-01', municipio_organo: 'Cáceres', plazo: { dias: 3, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'demandante' } }));
  assert.equal(r.estado, 'pregunta');
  const r2 = calcularPlazo(judicial({ cliente_es: 'demandado', fecha_notificacion: '2026-10-01', municipio_organo: 'Cáceres', plazo: { dias: 3, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'demandante' } }));
  assert.equal(r2.estado, 'sin_plazo');
});
