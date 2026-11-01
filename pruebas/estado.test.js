import test from 'node:test';
import assert from 'node:assert/strict';
import { FASES, transicion, accionAtajo, estadoInicial } from '../background/estado.js';

const EVENTOS = ['iniciar', 'captura_lista', 'cuenta_fin', 'pausar', 'reanudar', 'detener', 'terminado', 'cancelar', 'error'];

// Todas las celdas no vacías de la tabla; lo que no está aquí debe ser null.
const TABLA = {
  inactivo: { iniciar: 'eligiendo' },
  eligiendo: { captura_lista: 'cuenta_atras', terminado: 'inactivo', cancelar: 'inactivo', error: 'inactivo' },
  cuenta_atras: { cuenta_fin: 'grabando', detener: 'inactivo', terminado: 'inactivo', cancelar: 'inactivo', error: 'inactivo' },
  grabando: { pausar: 'en_pausa', detener: 'cerrando', terminado: 'inactivo', error: 'cerrando' },
  en_pausa: { reanudar: 'grabando', detener: 'cerrando', terminado: 'inactivo', error: 'cerrando' },
  cerrando: { terminado: 'inactivo', error: 'inactivo' },
};

test('FASES', () => {
  assert.deepEqual(FASES, ['inactivo', 'eligiendo', 'cuenta_atras', 'grabando', 'en_pausa', 'cerrando']);
});

test('tabla completa: cada celda, permitida o no', () => {
  assert.deepEqual(Object.keys(TABLA), FASES);
  for (const fase of FASES) {
    for (const evento of EVENTOS) {
      const esperado = TABLA[fase][evento] ?? null;
      assert.equal(transicion(fase, evento), esperado, `${fase} + ${evento}`);
    }
  }
});

test('celdas vacías concretas, incluido el doble inicio', () => {
  assert.equal(transicion('grabando', 'iniciar'), null);
  assert.equal(transicion('eligiendo', 'iniciar'), null);
  assert.equal(transicion('cerrando', 'cancelar'), null);
});

test('fase o evento desconocidos: null', () => {
  assert.equal(transicion('nada', 'iniciar'), null);
  assert.equal(transicion('inactivo', 'nada'), null);
  assert.equal(transicion('inactivo', 'toString'), null);
  assert.equal(transicion('constructor', 'iniciar'), null);
});

test('accionAtajo alternar-grabacion', () => {
  const esperado = {
    inactivo: 'iniciar', eligiendo: 'cancelar', cuenta_atras: 'cancelar',
    grabando: 'detener', en_pausa: 'detener', cerrando: null,
  };
  for (const fase of FASES) assert.equal(accionAtajo(fase, 'alternar-grabacion'), esperado[fase], fase);
});

test('accionAtajo alternar-pausa', () => {
  const esperado = { grabando: 'pausar', en_pausa: 'reanudar' };
  for (const fase of FASES) assert.equal(accionAtajo(fase, 'alternar-pausa'), esperado[fase] ?? null, fase);
});

test('accionAtajo con comando desconocido: null', () => {
  assert.equal(accionAtajo('inactivo', 'otro'), null);
});

test('estadoInicial', () => {
  assert.deepEqual(estadoInicial(), {
    fase: 'inactivo', sesionId: null, config: null, inicioMs: null, ms: 0, bytes: 0,
    ancho: null, alto: null, original: null, conAudio: false, superficie: null,
    tituloPestana: '', pestanaId: null, avisos: [], error: null,
  });
});

test('estadoInicial devuelve un objeto nuevo cada vez', () => {
  const a = estadoInicial();
  a.fase = 'grabando';
  a.avisos.push('x');
  const b = estadoInicial();
  assert.equal(b.fase, 'inactivo');
  assert.deepEqual(b.avisos, []);
});
