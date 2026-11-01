'use strict';
// Superposición en la página: cuenta atrás, pastilla y controles. El shadow root es
// cerrado, así que se mira con CDP (DOM.getDocument con pierce) y con capturas.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { servirRepo, lanzarExtension, dormir, esperar } = require('./util.cjs');

const PANTALLA = { fuente: 'monitor', audio: false, calidad: 'normal', fps: 30 };
const T = { timeout: 90000 };
const ID_HOST = 'grabador-mp4-superposicion';
const ROJO = [0xC8, 0x30, 0x2B];

const estado = (sw) => sw.evaluate(() => self.grabador.leerEstado());
const aplicar = (sw, evento, cambios) => sw.evaluate(
  ([e, c]) => self.grabador.aplicar(e, c), [evento, cambios ?? {}],
);
const iniciar = (sw, pestanaId) => aplicar(sw, 'iniciar', { config: PANTALLA, tituloPestana: '', pestanaId });
const esperarFase = (sw, fase, timeout = 20000) => esperar(
  async () => { const e = await estado(sw); return e.fase === fase && e; },
  { timeout, que: `la fase ${fase}` },
);
const idsPestanas = (sw) => sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id));

// Abre una pestaña y devuelve su página y su id (por diferencia de ids: chrome:// no deja ver la URL).
async function abrirPagina(ext, url) {
  const antes = new Set(await idsPestanas(ext.sw));
  const page = await ext.ctx.newPage();
  await page.goto(url);
  const tabId = (await idsPestanas(ext.sw)).find((id) => !antes.has(id));
  assert.ok(Number.isInteger(tabId), 'id de la pestaña nueva');
  await page.bringToFront();
  return { page, tabId };
}

// --- CDP: árbol con shadow roots cerrados -----------------------------------------------------

function atributos(nodo) {
  const a = {};
  const l = nodo.attributes ?? [];
  for (let i = 0; i < l.length; i += 2) a[l[i]] = l[i + 1];
  return a;
}

function* recorrer(nodo) {
  yield nodo;
  for (const hijo of [...(nodo.children ?? []), ...(nodo.shadowRoots ?? []), ...(nodo.contentDocument ? [nodo.contentDocument] : [])]) {
    yield* recorrer(hijo);
  }
}

const textoDe = (nodo) => [...recorrer(nodo)].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();

// Devuelve {hay, buscar(pred), centro(nodo), texto(nodo)} sobre el árbol actual de la página.
async function inspeccionar(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const nodos = [...recorrer(root)];
    const host = nodos.find((n) => atributos(n).id === ID_HOST);
    const buscar = (pred) => nodos.find((n) => n.nodeType === 1 && pred(atributos(n), n));
    // Las cajas se miden ya, con la sesión abierta, de lo que lleva data-parte o aria-label.
    const cajas = new Map();
    for (const n of nodos) {
      const a = n.nodeType === 1 ? atributos(n) : {};
      if (!a['data-parte'] && !a['aria-label']) continue;
      const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: n.backendNodeId }).catch(() => ({}));
      if (!model) continue;
      const q = model.border;
      const izq = Math.min(q[0], q[2], q[4], q[6]);
      cajas.set(n, { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4, izq, ancho: Math.max(q[0], q[2], q[4], q[6]) - izq });
    }
    const centro = async (nodo) => cajas.get(nodo);
    return { host, buscar, centro, texto: textoDe };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

const cuantosHost = (page) => page.evaluate((id) => document.querySelectorAll(`#${id}`).length, ID_HOST);
// Un elemento con `hidden` está en el árbol pero no se ve.
const parte = (nombre) => (a) => a['data-parte'] === nombre && !('hidden' in a);
const boton = (nombre) => (a) => a['aria-label'] === nombre;

// --- Píxeles ----------------------------------------------------------------------------------

// PNG de 8 bits, RGB o RGBA, sin entrelazar (lo que da Chromium).
function decodificarPng(buf) {
  let pos = 8;
  let ancho; let alto; let tipo; let profundidad; let entrelazado;
  const datos = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const marca = buf.toString('ascii', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + largo);
    if (marca === 'IHDR') {
      ancho = d.readUInt32BE(0); alto = d.readUInt32BE(4); profundidad = d[8]; tipo = d[9]; entrelazado = d[12];
    } else if (marca === 'IDAT') datos.push(d);
    pos += 12 + largo;
  }
  assert.equal(profundidad, 8);
  assert.ok(tipo === 2 || tipo === 6, `tipo de color PNG ${tipo}`);
  assert.equal(entrelazado, 0);
  const bpp = tipo === 6 ? 4 : 3;
  const fila = ancho * bpp;
  const crudo = zlib.inflateSync(Buffer.concat(datos));
  const salida = Buffer.alloc(alto * fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    for (let x = 0; x < fila; x++) {
      const actual = crudo[y * (fila + 1) + 1 + x];
      const a = x >= bpp ? salida[y * fila + x - bpp] : 0;
      const b = y ? salida[(y - 1) * fila + x] : 0;
      const c = x >= bpp && y ? salida[(y - 1) * fila + x - bpp] : 0;
      let v;
      if (filtro === 0) v = actual;
      else if (filtro === 1) v = actual + a;
      else if (filtro === 2) v = actual + b;
      else if (filtro === 3) v = actual + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v = actual + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      salida[y * fila + x] = v & 255;
    }
  }
  return { ancho, alto, pixel: (x, y) => [...salida.subarray(y * fila + x * bpp, y * fila + x * bpp + 3)] };
}

const esRojo = (rgb) => rgb.every((v, i) => Math.abs(v - ROJO[i]) <= 6);

// Color del píxel que hay en el punto (x, y) en píxeles CSS de la página.
async function colorEn(page, x, y) {
  const png = decodificarPng(await page.screenshot({ type: 'png' }));
  const escala = png.ancho / (await page.evaluate(() => window.innerWidth));
  return png.pixel(Math.round(x * escala), Math.round(y * escala));
}

// --- Arnés ------------------------------------------------------------------------------------

let servidor;
let ext;
let url;

before(async () => {
  servidor = await servirRepo();
  url = `${servidor.url}/pruebas/integracion/pagina-vacia.html`;
  ext = await lanzarExtension({ args: ['--auto-select-desktop-capture-source=Entire screen'], permisosHost: true });
});

after(async () => {
  await ext?.cerrar();
  await servidor?.cerrar();
});

beforeEach(async () => {
  if (!ext) return;
  const { sw, ctx } = ext;
  const e = await estado(sw);
  if (e.fase === 'grabando' || e.fase === 'en_pausa') await aplicar(sw, 'detener');
  else if (e.fase === 'eligiendo' || e.fase === 'cuenta_atras') await aplicar(sw, 'cancelar');
  await esperarFase(sw, 'inactivo', 30000);
  await sw.evaluate(async () => {
    for (const s of await self.grabador.almacen.listarSesiones()) await self.grabador.almacen.borrarSesion(s.id);
  });
  for (const p of ctx.pages().slice(1)) await p.close();
}, { timeout: 60000 }); // sin tope, un fallo aquí colgaría la ejecución entera

const esperarPastilla = (page) => esperar(async () => {
  const v = await inspeccionar(page);
  return v.host && v.buscar(parte('pastilla')) && v;
}, { que: 'la pastilla' });

// --- Pruebas ----------------------------------------------------------------------------------

test('cuenta y pastilla', T, async () => {
  const { sw } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  await iniciar(sw, tabId);
  await esperarFase(sw, 'cuenta_atras');

  // Cuenta atrás: host, número y aro rojo (#C8302B) del círculo.
  const vista = await esperar(async () => {
    const v = await inspeccionar(page);
    return v.host && v.buscar(parte('cuenta')) && v;
  }, { timeout: 5000, que: 'la cuenta atrás en la página' });
  const numero = vista.texto(vista.buscar(parte('cuenta')));
  assert.match(numero, /^[1-3]$/);
  const c = await vista.centro(vista.buscar(parte('cuenta')));
  assert.ok(c.ancho > 80, `el número es grande (${c.ancho}px)`);
  assert.ok(esRojo(await colorEn(page, c.izq + 2, c.y)), 'aro rojo del número');
  assert.equal(await cuantosHost(page), 1);

  // Pastilla: punto rojo y tiempo mm:ss.
  await esperarFase(sw, 'grabando');
  const p = await esperarPastilla(page);
  assert.equal(p.buscar(parte('cuenta')), undefined, 'la cuenta atrás ya no está');
  assert.match(p.texto(p.buscar(parte('tiempo'))), /^\d\d:\d\d$/);
  const punto = await p.centro(p.buscar(parte('punto')));
  assert.ok(esRojo(await colorEn(page, punto.x, punto.y)), 'punto rojo de la pastilla');
  for (const nombre of ['Pausar grabación', 'Detener grabación', 'Ocultar controles']) {
    assert.ok(p.buscar(boton(nombre)), `botón «${nombre}»`);
  }
  // El tiempo avanza.
  const t0 = p.texto(p.buscar(parte('tiempo')));
  await esperar(async () => {
    const v = await inspeccionar(page);
    return v.texto(v.buscar(parte('tiempo'))) !== t0;
  }, { timeout: 8000, que: 'que avance el tiempo' });
});

test('detener desde la pastilla', T, async () => {
  const { sw, ctx } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  const inicial = await iniciar(sw, tabId);
  await esperarFase(sw, 'grabando');
  const p = await esperarPastilla(page);
  await esperar(async () => (await estado(sw)).bytes > 0, { que: 'el primer trozo' }); // con una parada casi inmediata no hay vídeo (ver «parada inmediata» en grabacion.test.cjs); aquí se prueba el botón, no eso
  const b = await p.centro(p.buscar(boton('Detener grabación')));
  await page.mouse.click(b.x, b.y);
  await esperarFase(sw, 'inactivo');
  await esperar(() => ctx.pages().some((x) => x.url().includes(`/vista/vista.html?sesion=${inicial.sesionId}`)),
    { timeout: 30000, que: 'la pestaña de vista' });
  // La pastilla se retira sola con la fase inactiva.
  await esperar(async () => (await cuantosHost(page)) === 0, { timeout: 8000, que: 'que se retire la superposición' });
});

test('pausa y reanuda desde la pastilla', T, async () => {
  const { sw } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  await iniciar(sw, tabId);
  await esperarFase(sw, 'grabando');
  let p = await esperarPastilla(page);
  let b = await p.centro(p.buscar(boton('Pausar grabación')));
  await page.mouse.click(b.x, b.y);
  await esperarFase(sw, 'en_pausa');
  p = await esperar(async () => {
    const v = await inspeccionar(page);
    return v.buscar(boton('Reanudar grabación')) && v;
  }, { timeout: 8000, que: 'el botón Reanudar' });
  b = await p.centro(p.buscar(boton('Reanudar grabación')));
  await page.mouse.click(b.x, b.y);
  await esperarFase(sw, 'grabando');
  await esperar(async () => {
    const v = await inspeccionar(page);
    return v.buscar(boton('Pausar grabación'));
  }, { timeout: 8000, que: 'que vuelva el botón Pausa' });
});

test('ocultar retira la pastilla y la grabación sigue', T, async () => {
  const { sw } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  await iniciar(sw, tabId);
  await esperarFase(sw, 'grabando');
  const p = await esperarPastilla(page);
  const b = await p.centro(p.buscar(boton('Ocultar controles')));
  await page.mouse.click(b.x, b.y);
  await esperar(async () => (await cuantosHost(page)) === 0, { timeout: 5000, que: 'que se oculte' });
  await dormir(3000); // los avisos de progreso no la devuelven
  assert.equal(await cuantosHost(page), 0);
  assert.equal((await estado(sw)).fase, 'grabando');
});

test('pestaña cerrada', T, async () => {
  const { sw } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  await iniciar(sw, tabId);
  await esperarFase(sw, 'grabando');
  await esperarPastilla(page);
  await page.close();
  await dormir(1500);
  assert.equal((await estado(sw)).fase, 'grabando');
  const insignia = () => sw.evaluate(() => chrome.action.getBadgeText({}));
  const a = await insignia();
  await dormir(2000);
  const d = await insignia();
  assert.match(a, /^\d\d:\d\d$/);
  assert.notEqual(a, d, 'la insignia avanza');
  const e = await estado(sw);
  assert.equal(e.fase, 'grabando');
  assert.equal(e.error, null);
});

test('chrome://', T, async () => {
  const { sw } = ext;
  const { tabId } = await abrirPagina(ext, 'chrome://version');
  await iniciar(sw, tabId);
  const e = await esperarFase(sw, 'grabando');
  assert.equal(e.error, null);
  await dormir(1500);
  const despues = await estado(sw);
  assert.equal(despues.fase, 'grabando');
  assert.equal(despues.error, null);
});

test('sin duplicar', T, async () => {
  const { sw } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  await iniciar(sw, tabId);
  await esperarFase(sw, 'grabando');
  await esperarPastilla(page);
  const inyectar = () => sw.evaluate((id) => chrome.scripting.executeScript({
    target: { tabId: id }, files: ['superposicion/superposicion.js'],
  }), tabId);
  await inyectar();
  await inyectar();
  await dormir(2500); // llegan avisos de progreso a los dos «oyentes», si los hubiera
  assert.equal(await cuantosHost(page), 1);
  const p = await inspeccionar(page);
  assert.ok(p.buscar(parte('pastilla')));
});

test('cancelar en la cuenta atrás retira el círculo y no deja número en la insignia', T, async () => {
  const { sw } = ext;
  const { page, tabId } = await abrirPagina(ext, url);
  await iniciar(sw, tabId);
  await esperarFase(sw, 'cuenta_atras');
  await esperar(async () => {
    const v = await inspeccionar(page);
    return v.host && v.buscar(parte('cuenta'));
  }, { timeout: 5000, que: 'la cuenta atrás en la página' });
  await aplicar(sw, 'cancelar');
  await esperar(async () => (await cuantosHost(page)) === 0, { timeout: 5000, que: 'que se retire el círculo' });
  await dormir(1500); // pasa algún tic de la cuenta atrás que ya no corresponde
  assert.equal(await cuantosHost(page), 0);
  assert.equal(await sw.evaluate(() => chrome.action.getBadgeText({})), '');
  assert.equal((await estado(sw)).fase, 'inactivo');
});
