import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTORES, AUDIO_BPS, MAX_PIXELES,
  bitrateVideo, tamanoConTope, tamanoReintento, bytesPorMinuto, formatoTiempo, formatoPeso,
} from '../comun/calidad.js';
import {
  CONFIG_DEFECTO, TIMESLICE_MS, CUENTA_S, AVISO_MS, MAX_MS, VIGILANTE_MS, REINTENTO_ANCHO,
} from '../comun/config.js';

test('constantes de configuracion', () => {
  assert.deepEqual(CONFIG_DEFECTO, { fuente: 'browser', audio: true, calidad: 'normal', fps: 30 });
  assert.equal(TIMESLICE_MS, 2000);
  assert.equal(CUENTA_S, 3);
  assert.equal(AVISO_MS, 3300000);
  assert.equal(MAX_MS, 3600000);
  assert.equal(VIGILANTE_MS, 5000);
  assert.equal(REINTENTO_ANCHO, 1920);
});

test('constantes de calidad', () => {
  assert.deepEqual(FACTORES, { normal: 0.07, alta: 0.10, maxima: 0.15 });
  assert.equal(AUDIO_BPS, 128000);
  assert.equal(MAX_PIXELES, 36864 * 256);
  assert.equal(MAX_PIXELES, 9437184);
});

test('bitrateVideo', () => {
  assert.equal(bitrateVideo(1920, 1080, 30, 'normal'), 4354560);
  assert.equal(bitrateVideo(2560, 1440, 30, 'normal'), 7741440);
  assert.ok(Number.isInteger(bitrateVideo(1366, 768, 30, 'alta')));
  assert.throws(() => bitrateVideo(1920, 1080, 30, 'ultra'), RangeError);
});

test('tamanoConTope no reduce lo que cabe', () => {
  assert.deepEqual(tamanoConTope(2560, 1440), { ancho: 2560, alto: 1440, reducido: false });
  assert.deepEqual(tamanoConTope(4096, 2304), { ancho: 4096, alto: 2304, reducido: false });
  assert.deepEqual(tamanoConTope(3440, 1440), { ancho: 3440, alto: 1440, reducido: false });
});

test('tamanoConTope reduce lo que pasa del tope', () => {
  assert.deepEqual(tamanoConTope(5120, 2880), { ancho: 4096, alto: 2304, reducido: true });
  const r = tamanoConTope(6016, 3384);
  assert.equal(r.reducido, true);
  assert.equal(r.ancho % 2, 0);
  assert.equal(r.alto % 2, 0);
  assert.ok(r.ancho * r.alto <= MAX_PIXELES);
  assert.ok(Math.abs(r.ancho / r.alto - 6016 / 3384) / (6016 / 3384) < 0.01);
});

test('tamanoReintento', () => {
  assert.deepEqual(tamanoReintento(5120, 2880), { ancho: 1920, alto: 1080 });
  assert.deepEqual(tamanoReintento(1280, 720), { ancho: 1280, alto: 720 });
  for (const [a, b] of [[5120, 2880], [3441, 1441], [1921, 1081], [999, 555]]) {
    const r = tamanoReintento(a, b);
    assert.equal(r.ancho % 2, 0);
    assert.equal(r.alto % 2, 0);
    assert.ok(r.ancho <= 1920);
  }
});

test('bytesPorMinuto', () => {
  assert.equal(bytesPorMinuto(2560, 1440, 30, 'normal', true), Math.round((7741440 + 128000) * 60 / 8));
  assert.equal(bytesPorMinuto(2560, 1440, 30, 'normal', false), Math.round(7741440 * 60 / 8));
});

test('formatoTiempo', () => {
  assert.equal(formatoTiempo(0), '00:00');
  assert.equal(formatoTiempo(61000), '01:01');
  assert.equal(formatoTiempo(3600000), '60:00');
  assert.equal(formatoTiempo(59999), '00:59');
});

test('formatoPeso', () => {
  assert.equal(formatoPeso(812e6), '812 MB');
  assert.equal(formatoPeso(1.4e9), '1,4 GB');
  assert.equal(formatoPeso(999.6e6), '1,0 GB');
});
