'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { servirRepo } = require('./util.cjs');

let servidor, navegador, pagina;

before(async () => {
  servidor = await servirRepo();
  navegador = await chromium.launch();
  pagina = await navegador.newPage();
  await pagina.goto(`${servidor.url}/pruebas/integracion/pagina-almacen.html`);
});

after(async () => {
  await navegador?.close();
  await servidor?.cerrar();
});

// Cada prueba usa ids propios y limpia al final, así no dependen del orden.
const sesionBase = (id) => ({
  id, estado: 'grabando', creada: 1, superficie: 'monitor', tituloPestana: 'T',
  ancho: 1920, alto: 1080, original: { ancho: 1920, alto: 1080 }, conAudio: false,
  mime: 'video/mp4', avisos: [],
});

test('los trozos se leen en orden de n y se concatenan', async () => {
  const texto = await pagina.evaluate(async ({ url, datos }) => {
    const a = await import(url + '/comun/almacen.js');
    await a.crearSesion(datos);
    await a.anadirTrozo('s1', 2, new Blob(['c']));
    await a.anadirTrozo('s1', 0, new Blob(['a']));
    await a.anadirTrozo('s1', 1, new Blob(['b']));
    const trozos = await a.leerTrozos('s1');
    return await new Blob(trozos).text();
  }, { url: servidor.url, datos: sesionBase('s1') });
  assert.equal(texto, 'abc');
});

test('actualizarSesion mezcla de forma superficial y conserva el resto', async () => {
  const s = await pagina.evaluate(async ({ url }) => {
    const a = await import(url + '/comun/almacen.js');
    await a.actualizarSesion('s1', { estado: 'terminada' });
    return await a.leerSesion('s1');
  }, { url: servidor.url });
  assert.equal(s.estado, 'terminada');
  assert.equal(s.superficie, 'monitor');
  assert.equal(s.ancho, 1920);
});

test('leerSesion de una sesión inexistente da undefined', async () => {
  const s = await pagina.evaluate(async ({ url }) => {
    const a = await import(url + '/comun/almacen.js');
    return (await a.leerSesion('no-existe')) === undefined;
  }, { url: servidor.url });
  assert.equal(s, true);
});

test('borrarSesion borra la sesión y sus trozos sin tocar las demás', async () => {
  const r = await pagina.evaluate(async ({ url, s2 }) => {
    const a = await import(url + '/comun/almacen.js');
    await a.crearSesion(s2);
    await a.anadirTrozo('s2', 0, new Blob(['x']));
    await a.anadirTrozo('s2', 1, new Blob(['y']));
    await a.borrarSesion('s1');
    return {
      de1: (await a.leerTrozos('s1')).length,
      de2: await new Blob(await a.leerTrozos('s2')).text(),
      ids: (await a.listarSesiones()).map((s) => s.id),
    };
  }, { url: servidor.url, s2: sesionBase('s2') });
  assert.equal(r.de1, 0);
  assert.equal(r.de2, 'xy');
  assert.deepEqual(r.ids, ['s2']);
});

test('espacio() devuelve cifras positivas', async () => {
  const e = await pagina.evaluate(async ({ url }) => {
    const a = await import(url + '/comun/almacen.js');
    await a.borrarSesion('s2');
    return await a.espacio();
  }, { url: servidor.url });
  assert.ok(e.libre > 0, 'libre > 0');
  assert.ok(e.cuota > 0, 'cuota > 0');
  assert.ok(e.libre <= e.cuota);
});
