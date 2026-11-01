import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// El service worker puede dormirse en cualquier momento: no debe guardar estado
// en variables de módulo. Todo pasa por leerEstado() / guardarEstado().
const fuente = readFileSync(new URL('../background/service-worker.js', import.meta.url), 'utf8');

test('service-worker.js no declara let ni var a nivel de módulo', () => {
  const culpables = fuente
    .split('\n')
    .map((linea, i) => ({ linea, n: i + 1 }))
    .filter(({ linea }) => /^(export\s+)?(let|var)\s/.test(linea));
  assert.deepEqual(culpables, [], culpables.map((c) => `línea ${c.n}: ${c.linea}`).join('\n'));
});

test('service-worker.js existe y no está vacío', () => {
  assert.ok(fuente.includes('aplicar'), 'define aplicar');
});
