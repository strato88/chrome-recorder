import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enviar, codigoErrorCaptura, ERRORES, AVISOS } from '../comun/mensajes.js';

const conSendMessage = (fn) => { globalThis.chrome = { runtime: { sendMessage: fn } }; };

test('enviar manda {tipo, ...datos} y devuelve la respuesta', async () => {
  let recibido;
  conSendMessage(async (m) => { recibido = m; return 'ok'; });
  assert.equal(await enviar('pausar', { destino: 'offscreen', sesionId: 's' }), 'ok');
  assert.deepEqual(recibido, { tipo: 'pausar', destino: 'offscreen', sesionId: 's' });
});

test('enviar sin receptor resuelve undefined sin lanzar', async () => {
  conSendMessage(async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); });
  assert.equal(await enviar('progreso'), undefined);
  conSendMessage(async () => { throw new Error('The message port closed before a response was received.'); });
  assert.equal(await enviar('progreso'), undefined);
});

test('enviar deja pasar los demás errores', async () => {
  conSendMessage(async () => { throw new Error('otro fallo'); });
  await assert.rejects(enviar('progreso'), /otro fallo/);
});

test('codigoErrorCaptura: cancelar, permiso del sistema y no poder empezar', () => {
  const error = (name, message) => Object.assign(new Error(message), { name });
  assert.equal(codigoErrorCaptura(error('NotAllowedError', 'Permission denied')), 'cancelado');
  assert.equal(codigoErrorCaptura(error('NotAllowedError', 'Permission denied by system')), 'permiso_sistema');
  assert.equal(codigoErrorCaptura(error('NotAllowedError', 'Permission denied by System')), 'permiso_sistema');
  assert.equal(codigoErrorCaptura(error('NotReadableError', 'Could not start video source')), 'no_empezar');
  assert.equal(codigoErrorCaptura(error('AbortError', 'x')), 'no_empezar');
  assert.equal(codigoErrorCaptura(undefined), 'no_empezar');
  assert.equal(codigoErrorCaptura('texto'), 'no_empezar');
});

test('ERRORES incluye permiso_sistema y no_empezar, y cada código tiene su texto', () => {
  assert.ok(ERRORES.includes('permiso_sistema'));
  assert.ok(ERRORES.includes('no_empezar'));
  const textos = JSON.parse(readFileSync(new URL('../_locales/es/messages.json', import.meta.url), 'utf8'));
  const camel = (c) => c.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
  for (const codigo of ERRORES) assert.ok(textos[`error${camel(codigo)}`]?.message, `falta error${camel(codigo)}`);
  for (const codigo of AVISOS) assert.ok(textos[`aviso${camel(codigo)}`]?.message, `falta aviso${camel(codigo)}`);
});
