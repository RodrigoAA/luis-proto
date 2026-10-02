// Pruebas del mensaje al cliente (no llaman a la IA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirFicha, jergaEn } from '../lib/ficha.js';

const base = {
  texto_legible: true, tipo_documento: 'Requerimiento', organismo: 'Agencia Tributaria', procedimiento: null,
  jurisdiccion: 'tributaria', es_penal: false, canal: 'dehu', cliente_es: 'no_aplica',
  fecha_notificacion: '2026-10-01', fecha_puesta_disposicion: '2026-09-29', motivo_fecha: 'acceso DEHú',
  fecha_limite_en_documento: null, municipio_organo: 'Cáceres',
  plazo: { dias: 10, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'destinatario', descripcion: 'aportar documentación' },
  resumen: '', que_hacer: [], pregunta_para_luis: null, avisos: [],
  tratamiento: 'Estimado', nombre_pila: 'Javier',
  mensaje_cliente: 'Hacienda le pide documentación. Mándemela antes de {FECHA_LIMITE}.',
  mensaje_sin_plazo: 'Por ahora no tiene que hacer nada.',
};

test('con plazo del cliente, el mensaje lleva la fecha concreta del último día', () => {
  const f = construirFicha(base);
  assert.match(f.mensaje_cliente, /antes del 16 de octubre/);
  assert.doesNotMatch(f.mensaje_cliente, /\{FECHA_LIMITE\}|días hábiles/);
});

test('si la IA olvida el hueco de la fecha, el código la añade', () => {
  const f = construirFicha({ ...base, mensaje_cliente: 'Hacienda le pide documentación.' });
  assert.match(f.mensaje_cliente, /16 de octubre/);
});

test('saludo con nombre de pila y firma', () => {
  const f = construirFicha({ ...base, nombre_pila: 'Javier' });
  assert.ok(f.mensaje_cliente.startsWith('Estimado Javier:\n'));
  assert.ok(f.mensaje_cliente.endsWith('Atentamente,\nLuis Bohoyo'));
});

test('sin cliente identificado: Buenos días', () => {
  const f = construirFicha({ ...base, tratamiento: null, nombre_pila: null });
  assert.ok(f.mensaje_cliente.startsWith('Buenos días,\n'));
});

test('el día de gracia nunca llega al cliente', () => {
  const judicial = { ...base, jurisdiccion: 'judicial', canal: 'lexnet', cliente_es: 'demandante', municipio_organo: 'Plasencia',
    fecha_notificacion: '2026-10-02', plazo: { dias: 5, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'ambas', descripcion: 'x' } };
  const f = construirFicha(judicial);
  assert.ok(f.gracia);
  assert.doesNotMatch(f.mensaje_cliente, /15:00|gracia/);
});

test('la respuesta de Luis cambia el mensaje', () => {
  const dil = { ...base, jurisdiccion: 'judicial', canal: 'lexnet', cliente_es: 'no_consta', tratamiento: null, nombre_pila: null,
    fecha_notificacion: '2026-09-28', municipio_organo: 'Cáceres',
    plazo: { dias: 5, unidad: 'hábiles', para_quien: 'desconocido', parte_con_plazo: 'demandante', descripcion: 'pedir vista' } };
  const antes = construirFicha(dil).mensaje_cliente;
  const demandante = construirFicha(dil, { cliente_es: 'demandante' }).mensaje_cliente;
  const demandado = construirFicha(dil, { cliente_es: 'demandado' }).mensaje_cliente;
  assert.notEqual(demandante, demandado);
  assert.match(demandante, /antes del/);
  assert.match(demandado, /no tiene que hacer nada/);
  assert.equal(antes, demandado);
});

test('detecta jerga sin falsos positivos en el saludo', () => {
  assert.deepEqual(jergaEn('El juzgado ha dado traslado y estima la demanda'), ['traslado', 'estima']);
  assert.deepEqual(jergaEn('Estimado Javier: el juicio será el día 12.'), []);
});

test('la jerga que se cuela se traduce en el mensaje final (salida real de la IA)', async () => {
  const { construirFicha, jergaEn } = await import('../lib/ficha.js');
  const base = { tratamiento: null, nombre_pila: null, plazo: { dias: 5, unidad: 'hábiles', para_quien: 'cliente', parte_con_plazo: 'ambas' }, jurisdiccion: 'judicial', canal: 'lexnet', fecha_notificacion: '2026-10-01', municipio_organo: 'Cáceres' };
  for (const m of ['Ha llegado un decreto del juzgado que señala la vista para el 12 de marzo de 2027 a las 10:30. Debe indicarnos antes de {FECHA_LIMITE} los testigos para la vista.', 'Ha llegado la sentencia del juzgado que estima parcialmente la demanda. Si quiere reclamar, antes de {FECHA_LIMITE}.']) {
    const f = construirFicha({ ...base, mensaje_cliente: m, mensaje_sin_plazo: m.replace(/ Debe.*| Si quiere.*/, '') });
    assert.deepEqual(jergaEn(f.mensaje_cliente), [], f.mensaje_cliente);
  }
});

test('Luis puede responder también con para_quien', async () => {
  const { construirFicha } = await import('../lib/ficha.js');
  const d = { tratamiento: null, nombre_pila: null, plazo: { dias: 5, unidad: 'hábiles', para_quien: 'desconocido', parte_con_plazo: 'demandante' }, cliente_es: 'no_consta', jurisdiccion: 'judicial', canal: 'lexnet', fecha_notificacion: '2026-09-29', municipio_organo: 'Cáceres', mensaje_cliente: 'Tiene que aportar un documento antes de {FECHA_LIMITE}.', mensaje_sin_plazo: 'Por ahora no tiene que hacer nada.' };
  assert.match(construirFicha(d, { para_quien: 'cliente' }).mensaje_cliente, /antes del? \d/);
  assert.match(construirFicha(d, { para_quien: 'otra_parte' }).mensaje_cliente, /no tiene que hacer nada/);
});
