import test from 'node:test';
import assert from 'node:assert/strict';
import { enviar } from '../comun/mensajes.js';

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
