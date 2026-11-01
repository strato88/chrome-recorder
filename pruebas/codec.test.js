import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirCodec } from '../comun/codec.js';

const AAC = [
  'video/mp4;codecs="avc1.640034,mp4a.40.2"',
  'video/mp4;codecs="avc1.4D0034,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E034,mp4a.40.2"',
  'video/mp4;codecs="avc1,mp4a.40.2"',
];

test('todo soportado, con audio: el primero de la lista AAC', () => {
  assert.deepEqual(elegirCodec({ conAudio: true, esSoportado: () => true, plataforma: 'win' }), { mime: AAC[0] });
});

test('solo avc1,mp4a.40.2 soportado', () => {
  const r = elegirCodec({ conAudio: true, esSoportado: (m) => m === AAC[3], plataforma: 'mac' });
  assert.deepEqual(r, { mime: AAC[3] });
});

test('sin audio y solo avc1.42E034 soportado', () => {
  const mime = 'video/mp4;codecs="avc1.42E034"';
  const r = elegirCodec({ conAudio: false, esSoportado: (m) => m === mime, plataforma: 'win' });
  assert.deepEqual(r, { mime });
});

test('sin audio no se pide audio en ninguna candidata', () => {
  const probados = [];
  elegirCodec({ conAudio: false, esSoportado: (m) => { probados.push(m); return false; }, plataforma: 'win', permitirOpus: true });
  assert.ok(probados.length > 0);
  assert.ok(probados.every((m) => !m.includes('mp4a') && !m.includes('opus')));
});

test('nada soportado en win: sin_mp4', () => {
  assert.deepEqual(elegirCodec({ conAudio: true, esSoportado: () => false, plataforma: 'win' }), { error: 'sin_mp4' });
});

test('linux sin permitirOpus: error linux sin probar nada', () => {
  let llamadas = 0;
  const r = elegirCodec({ conAudio: true, esSoportado: () => { llamadas++; return true; }, plataforma: 'linux' });
  assert.deepEqual(r, { error: 'linux' });
  assert.equal(llamadas, 0);
});

test('linux con permitirOpus y solo Opus soportado', () => {
  const r = elegirCodec({
    conAudio: true,
    esSoportado: (m) => m.endsWith(',opus"'),
    plataforma: 'linux',
    permitirOpus: true,
  });
  assert.deepEqual(r, { mime: 'video/mp4;codecs="avc1.640034,opus"' });
});

test('con permitirOpus, los AAC van antes que Opus', () => {
  const r = elegirCodec({ conAudio: true, esSoportado: () => true, plataforma: 'win', permitirOpus: true });
  assert.deepEqual(r, { mime: AAC[0] });
});
