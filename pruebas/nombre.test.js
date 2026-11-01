import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiarTitulo, nombreArchivo } from '../comun/nombre.js';

const fecha = new Date(2026, 10, 1, 14, 32, 5);
const sufijo = '_2026-11-01_14-32.mp4';
const nombre = (tituloPestana, superficie = 'browser') => nombreArchivo({ superficie, tituloPestana, fecha });

test('pestaña con título', () => {
  assert.equal(nombre('Panel de tráfico · NewFox'), `Panel-de-trafico-NewFox${sufijo}`);
});

test('ventana y pantalla', () => {
  assert.equal(nombre('lo que sea', 'window'), `Ventana${sufijo}`);
  assert.equal(nombre('lo que sea', 'monitor'), `Pantalla${sufijo}`);
});

test('caracteres prohibidos', () => {
  const r = limpiarTitulo('a:b/c\\d*e?f"g<h>i|j');
  assert.doesNotMatch(r, /[\\/:*?"<>|]/);
  assert.doesNotMatch(nombre('a:b/c\\d*e?f"g<h>i|j'), /[\\/:*?"<>|]/);
});

test('emoji', () => {
  assert.equal(nombre('🎬 Demo 🎬'), `Demo${sufijo}`);
});

test('título largo se corta a 80', () => {
  assert.equal(limpiarTitulo('x'.repeat(300)), 'x'.repeat(80));
  assert.equal(nombre('x'.repeat(300)), `${'x'.repeat(80)}${sufijo}`);
});

test('título vacío o inservible: Grabacion', () => {
  for (const t of ['', '   ', '???', undefined]) {
    assert.equal(nombre(t), `Grabacion${sufijo}`);
  }
});

test('acentos y eñes', () => {
  assert.equal(nombre('Nueva pestaña'), `Nueva-pestana${sufijo}`);
});

test('nunca empieza ni acaba en - o ., ni contiene --', () => {
  for (const t of ['-hola-', '..hola..', '--a--b--', ' . a . ', 'a - - b', '.-.', 'x'.repeat(79) + '-y']) {
    const r = limpiarTitulo(t);
    assert.doesNotMatch(r, /^[-.]|[-.]$/, `extremos en ${JSON.stringify(r)}`);
    assert.ok(!r.includes('--'), `doble guion en ${JSON.stringify(r)}`);
  }
});

test('fecha con ceros a la izquierda', () => {
  const r = nombreArchivo({ superficie: 'window', tituloPestana: '', fecha: new Date(2026, 0, 5, 3, 7) });
  assert.equal(r, 'Ventana_2026-01-05_03-07.mp4');
});
