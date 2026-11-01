'use strict';
// Vista previa: datos reales del vídeo, Guardar como (con un sustituto de
// showSaveFilePicker), Descartar, sesión inexistente y recuperación de grabaciones
// que se quedaron a medias.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lanzarExtension, ffprobe, esperar, dormir } = require('./util.cjs');

const PANTALLA = { fuente: 'monitor', audio: false, calidad: 'normal', fps: 30 };
const T = { timeout: 120000 };
const NOMBRE = /^Pantalla_\d{4}-\d\d-\d\d_\d\d-\d\d\.mp4$/;

let ext;
let plantilla; // {id, pagina}: grabación de 5 s que se clona para cada caso

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

const estado = (sw) => sw.evaluate(() => self.grabador.leerEstado());
const aplicar = (sw, evento, cambios) => sw.evaluate(([e, c]) => self.grabador.aplicar(e, c), [evento, cambios ?? {}]);
const iniciar = (sw) => aplicar(sw, 'iniciar', { config: PANTALLA, tituloPestana: '', pestanaId: null });
const leerSesion = (sw, id) => sw.evaluate((x) => self.grabador.almacen.leerSesion(x), id);
const numTrozos = (sw, id) => sw.evaluate(async (x) => (await self.grabador.almacen.leerTrozos(x)).length, id);
const recuperar = (sw) => sw.evaluate(() => self.grabador.recuperarHuerfanas());
const offscreens = (sw) => sw.evaluate(
  async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length,
);

const esperarFase = (sw, fase, timeout = 20000) => esperar(
  async () => { const e = await estado(sw); return e.fase === fase && e; },
  { timeout, que: `la fase ${fase}` },
);

const urlVista = (id, recuperada = false) =>
  `chrome-extension://${ext.extId}/vista/vista.html?sesion=${id}${recuperada ? '&recuperada=1' : ''}`;

// Pestañas de vista abiertas de una sesión (las abre el service worker).
const vistasDe = (id) => ext.ctx.pages().filter((p) => p.url().includes(`/vista/vista.html?sesion=${id}`));

async function esperarVista(id, { recuperada = false, timeout = 30000 } = {}) {
  const pagina = await esperar(() => vistasDe(id).find((p) => p.url() === urlVista(id, recuperada)),
    { timeout, que: `la vista de ${id}${recuperada ? ' (recuperada)' : ''}` });
  await pagina.waitForSelector('#app[data-listo]');
  return pagina;
}

async function abrirVista(id, { recuperada = false } = {}) {
  const pagina = await ext.ctx.newPage();
  await pagina.goto(urlVista(id, recuperada));
  await pagina.waitForSelector('#app[data-listo]');
  return pagina;
}

// Copia una sesión (y sus trozos) con otro id: cada caso trabaja sobre su copia.
const clonar = (origen, cambios = {}) => ext.sw.evaluate(async ([o, c]) => {
  const a = self.grabador.almacen;
  const id = crypto.randomUUID();
  await a.crearSesion({ ...(await a.leerSesion(o)), ...c, id });
  const trozos = await a.leerTrozos(o);
  for (let n = 0; n < trozos.length; n++) await a.anadirTrozo(id, n, trozos[n]);
  return id;
}, [origen, cambios]);

// Sustituto de showSaveFilePicker para todas las páginas: recoge lo que se escribe.
// window.__modoPicker: 'ok' (por defecto), 'abortar', 'fallar' o 'fallar_escritura'.
function sustituto() {
  window.__guardado = { opciones: null, escrituras: [], cerrado: false, abortado: false };
  window.showSaveFilePicker = async (opciones) => {
    const g = window.__guardado;
    g.opciones = opciones;
    const modo = window.__modoPicker ?? 'ok';
    if (modo === 'abortar') throw new DOMException('The user aborted a request.', 'AbortError');
    if (modo === 'fallar') throw new DOMException('Not allowed', 'NotAllowedError');
    return {
      kind: 'file',
      name: 'Mi-video.mp4',
      createWritable: async () => ({
        async write(datos) {
          if (modo === 'fallar_escritura' && g.escrituras.length === 1) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          }
          const bytes = new Uint8Array(await new Blob([datos]).arrayBuffer());
          let binario = '';
          for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          g.escrituras.push(btoa(binario));
        },
        async close() { g.cerrado = true; },
        async abort() { g.abortado = true; },
      }),
    };
  };
}

const guardado = (pagina) => pagina.evaluate(() => window.__guardado);

// Escribe lo que recibió el sustituto en un MP4 temporal y lo pasa por ffprobe.
function sondearEscrito(escrituras) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-'));
  const ruta = path.join(dir, 'video.mp4');
  try {
    fs.writeFileSync(ruta, Buffer.concat(escrituras.map((b) => Buffer.from(b, 'base64'))));
    const datos = ffprobe(ruta);
    return { video: datos.streams.find((s) => s.codec_type === 'video'), duracion: Number(datos.format.duration) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const texto = (pagina, selector) => pagina.textContent(selector).then((t) => (t ?? '').trim());

// Graba la pantalla `ms` milisegundos y deja la grabación en marcha. Devuelve el id.
async function grabarSinParar(sw, ms) {
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  await esperar(async () => (await estado(sw)).bytes > 0, { que: 'el primer trozo' });
  await dormir(ms);
  await esperar(async () => (await numTrozos(sw, inicial.sesionId)) >= 2, { que: 'dos trozos escritos' });
  return inicial.sesionId;
}

// Chrome mata la grabadora (como al cerrarse): nadie manda `terminado`.
const matarGrabadora = (sw) => sw.evaluate(() => chrome.offscreen.closeDocument());

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------

before(async () => {
  ext = await lanzarExtension({ args: ['--auto-select-desktop-capture-source=Entire screen'] });
  await ext.ctx.addInitScript(sustituto);
  const { sw } = ext;
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  await dormir(5000);
  await aplicar(sw, 'detener');
  const pagina = await esperarVista(inicial.sesionId);
  await esperarFase(sw, 'inactivo');
  plantilla = { id: inicial.sesionId, pagina };
}, { timeout: 90000 });

after(async () => { await ext?.cerrar(); });

// Reposo, solo la plantilla en el almacén y solo su vista abierta.
beforeEach(async () => {
  if (!ext || !plantilla) return;
  const { sw, ctx } = ext;
  const e = await estado(sw);
  if (e.fase === 'grabando' || e.fase === 'en_pausa') await aplicar(sw, 'detener');
  else if (e.fase === 'eligiendo' || e.fase === 'cuenta_atras') await aplicar(sw, 'cancelar');
  await esperarFase(sw, 'inactivo', 30000);
  await esperar(async () => (await offscreens(sw)) === 0, { que: 'sin offscreen' });
  await sw.evaluate(async (guardar) => {
    for (const s of await self.grabador.almacen.listarSesiones()) {
      if (s.id !== guardar) await self.grabador.almacen.borrarSesion(s.id);
    }
    await chrome.storage.session.remove('vistasRecientes');
  }, plantilla.id);
  for (const p of ctx.pages().slice(1)) if (p !== plantilla.pagina) await p.close();
});

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

test('tras grabar 5 s, la vista enseña la resolución real, la duración, el peso y el nombre', T, async () => {
  const p = plantilla.pagina;
  await esperar(async () => (await texto(p, '#resolucion')) === '1440×900', { que: 'la resolución real' });
  assert.match(await texto(p, '#duracion'), /^00:0\d$/);
  assert.match(await texto(p, '#peso'), /^(<1|\d+) MB$/);
  assert.match(await texto(p, '#nombre'), NOMBRE);
  assert.match(await p.getAttribute('#video', 'src'), /^blob:chrome-extension:/);
  assert.equal(await p.isVisible('#video'), true);
  assert.equal(await p.locator('#avisos li').count(), 0, 'sin avisos');
  assert.equal(await p.isEnabled('#guardar'), true);
  assert.equal(await p.isEnabled('#descartar'), true);
  assert.equal(await p.title(), 'Vista previa · Grabador MP4');
});

test('Guardar escribe los trozos uno a uno, el MP4 es válido y la sesión se borra', T, async () => {
  const { sw } = ext;
  const id = await clonar(plantilla.id);
  const trozos = await numTrozos(sw, id);
  const p = await abrirVista(id);
  const nombre = await texto(p, '#nombre');
  await p.click('#guardar');
  await esperar(async () => (await texto(p, '#resultado')) === 'Guardado como Mi-video.mp4', { que: 'Guardado como' });
  const g = await guardado(p);
  assert.equal(g.opciones.suggestedName, nombre);
  assert.deepEqual(g.opciones.types, [{ description: 'Vídeo MP4', accept: { 'video/mp4': ['.mp4'] } }]);
  assert.equal(g.escrituras.length, trozos, 'una escritura por trozo');
  assert.equal(g.cerrado, true);
  const r = sondearEscrito(g.escrituras);
  assert.equal(r.video.codec_name, 'h264');
  assert.equal(r.video.width, 1440);
  assert.equal(r.video.height, 900);
  await esperar(async () => (await leerSesion(sw, id)) === undefined, { que: 'la sesión borrada' });
  assert.equal(await p.isDisabled('#guardar'), true);
  assert.equal(await p.isDisabled('#descartar'), true);
  assert.equal(await p.isVisible('#video'), true, 'el vídeo sigue a la vista');
});

test('Guardar cancelado (AbortError) no hace nada y lo conserva todo', T, async () => {
  const { sw } = ext;
  const id = await clonar(plantilla.id);
  const p = await abrirVista(id);
  await p.evaluate(() => { window.__modoPicker = 'abortar'; });
  await p.click('#guardar');
  await esperar(async () => (await guardado(p)).opciones, { que: 'el diálogo pedido' });
  await esperar(() => p.isEnabled('#guardar'), { que: 'Guardar de nuevo activo' });
  await dormir(300);
  assert.equal(await p.isVisible('#resultado'), false, 'sin mensaje');
  assert.equal(await p.isEnabled('#descartar'), true);
  assert.equal((await leerSesion(sw, id))?.estado, 'terminada');
  assert.ok((await numTrozos(sw, id)) > 0);
});

test('un error al guardar se dice en claro y lo conserva todo', T, async () => {
  const { sw } = ext;
  const id = await clonar(plantilla.id);
  const p = await abrirVista(id);
  await p.evaluate(() => { window.__modoPicker = 'fallar'; });
  await p.click('#guardar');
  await esperar(async () => (await texto(p, '#resultado')).startsWith('No se ha podido guardar: '), { que: 'el error' });
  assert.equal(await p.isEnabled('#guardar'), true);
  assert.equal((await leerSesion(sw, id))?.estado, 'terminada');

  // Fallo a mitad de escribir: se descarta el archivo a medias y se conserva la sesión.
  await p.evaluate(() => { window.__modoPicker = 'fallar_escritura'; window.__guardado.escrituras = []; });
  await p.click('#guardar');
  await esperar(async () => (await texto(p, '#resultado')) === 'No se ha podido guardar: no queda espacio en el disco',
    { que: 'el error de espacio' });
  assert.equal((await guardado(p)).abortado, true, 'archivo a medias descartado');
  assert.equal((await leerSesion(sw, id))?.estado, 'terminada');
  assert.ok((await numTrozos(sw, id)) > 0);
});

test('Descartar pide confirmación en la página; Volver y Escape no borran; confirmar borra', T, async () => {
  const { sw } = ext;
  const id = await clonar(plantilla.id);
  const p = await abrirVista(id);
  const dentro = () => p.evaluate(() => document.getElementById('confirmar').contains(document.activeElement));

  await p.click('#descartar');
  assert.equal(await p.isVisible('#confirmar'), true);
  assert.equal(await dentro(), true, 'el foco pasa a la confirmación');
  assert.equal(await p.isVisible('#acciones'), false);
  await p.click('#volver');
  assert.equal(await p.isVisible('#confirmar'), false);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'descartar');
  assert.ok(await leerSesion(sw, id), 'Volver no borra');

  await p.click('#descartar');
  await p.keyboard.press('Escape');
  assert.equal(await p.isVisible('#confirmar'), false, 'Escape = Volver');
  assert.ok(await leerSesion(sw, id), 'Escape no borra');

  await p.click('#descartar');
  await p.click('#descartar-siempre');
  await esperar(async () => (await texto(p, '#resultado')) === 'Grabación descartada', { que: 'el mensaje final' });
  assert.equal(await leerSesion(sw, id), undefined);
  assert.equal(await numTrozos(sw, id), 0);
  assert.equal(await p.isDisabled('#guardar'), true);
  assert.equal(await p.isDisabled('#descartar'), true);
});

test('una sesión que no existe: «Esta grabación ya no existe» y sin vídeo', T, async () => {
  const p = await abrirVista('noexiste');
  assert.equal(await texto(p, '#resultado'), 'Esta grabación ya no existe');
  assert.equal(await p.isVisible('#video'), false);
  assert.equal(await p.isVisible('#guardar'), false);
});

test('avisos de resolución reducida y sin sonido', T, async () => {
  const id = await clonar(plantilla.id, {
    avisos: ['reducida', 'sin_audio'], original: { ancho: 5120, alto: 3200 }, conAudio: false,
  });
  const p = await abrirVista(id);
  const avisos = await p.locator('#avisos li').allTextContents();
  assert.equal(avisos.length, 2, JSON.stringify(avisos));
  assert.ok(avisos.some((t) => t.includes('1440×900') && t.includes('5120×3200')), JSON.stringify(avisos));
  assert.ok(avisos.some((t) => /sin sonido/i.test(t)), JSON.stringify(avisos));
});

// ---------------------------------------------------------------------------
// Recuperación
// ---------------------------------------------------------------------------

test('recuperación: grabadora muerta y fase en reposo → vista recuperada y MP4 válido', T, async () => {
  const { sw } = ext;
  const id = await grabarSinParar(sw, 4000);
  await matarGrabadora(sw);
  await sw.evaluate(async () => {
    const { estado: e } = await chrome.storage.session.get('estado');
    await chrome.storage.session.set({ estado: { ...e, fase: 'inactivo' } });
  });
  assert.equal((await leerSesion(sw, id)).estado, 'grabando');
  const abiertas = await recuperar(sw);
  assert.deepEqual(abiertas, [id]);
  const p = await esperarVista(id, { recuperada: true });
  assert.equal((await leerSesion(sw, id)).estado, 'terminada');
  const avisos = await p.locator('#avisos li').allTextContents();
  assert.ok(avisos.some((t) => t.startsWith('Grabación recuperada')), JSON.stringify(avisos));
  await esperar(async () => (await texto(p, '#resolucion')) === '1440×900', { que: 'la resolución' });
  assert.match(await texto(p, '#duracion'), /^00:0\d$/);

  await p.click('#guardar');
  await esperar(async () => (await texto(p, '#resultado')).startsWith('Guardado como'), { que: 'Guardado como' });
  const r = sondearEscrito((await guardado(p)).escrituras);
  assert.equal(r.video.codec_name, 'h264');
  assert.equal(r.video.width, 1440);
  assert.ok(r.duracion > 1, `duración ${r.duracion}`);
  await esperar(async () => (await leerSesion(sw, id)) === undefined, { que: 'la sesión borrada' });
});

test('recuperación: fase colgada en «cerrando» sin grabadora → reposo, insignia limpia y vista', T, async () => {
  const { sw } = ext;
  const id = await grabarSinParar(sw, 2500);
  await matarGrabadora(sw);
  // Se había pedido detener, pero la grabadora ya no está para contestar.
  await sw.evaluate(async () => {
    const { estado: e } = await chrome.storage.session.get('estado');
    await chrome.storage.session.set({ estado: { ...e, fase: 'cerrando' } });
  });
  assert.notEqual(await sw.evaluate(() => chrome.action.getBadgeText({})), '');
  await recuperar(sw);
  const fin = await estado(sw);
  assert.equal(fin.fase, 'inactivo');
  assert.equal(await sw.evaluate(() => chrome.action.getBadgeText({})), '');
  await esperarVista(id, { recuperada: true });
  assert.equal((await leerSesion(sw, id)).estado, 'terminada');
});

test('recuperación: «iniciar» con la fase colgada recupera la anterior y empieza otra', T, async () => {
  const { sw } = ext;
  const id = await grabarSinParar(sw, 2500);
  await matarGrabadora(sw);
  assert.equal((await estado(sw)).fase, 'grabando', 'colgada: nadie avisa');
  const nueva = await iniciar(sw);
  assert.equal(nueva?.fase, 'eligiendo');
  assert.notEqual(nueva.sesionId, id);
  await esperarVista(id, { recuperada: true });
  assert.equal((await leerSesion(sw, id)).estado, 'terminada');
  await esperarFase(sw, 'grabando'); // la nueva graba con normalidad
});

test('recuperación: al despertar el service worker con la fase colgada', T, async () => {
  const { ctx } = ext;
  const id = await grabarSinParar(ext.sw, 2500);
  await matarGrabadora(ext.sw);
  assert.equal((await estado(ext.sw)).fase, 'grabando', 'colgada: nadie avisa');
  // Se para el service worker de verdad (CDP) y se despierta con un mensaje cualquiera.
  const pagina = await ctx.newPage();
  await pagina.goto(`chrome-extension://${ext.extId}/popup/popup.html`);
  const cdp = await ctx.newCDPSession(pagina);
  await cdp.send('ServiceWorker.enable');
  await ext.sw.evaluate(() => { self.antesDeParar = true; });
  await cdp.send('ServiceWorker.stopAllWorkers');
  await pagina.evaluate(() => chrome.runtime.sendMessage({ tipo: 'despertar' }).catch(() => {}));
  await esperarVista(id, { recuperada: true });
  const sw = ext.ctx.serviceWorkers()[0];
  assert.equal(await sw.evaluate(() => self.antesDeParar), undefined, 'es un service worker nuevo');
  assert.equal((await estado(sw)).fase, 'inactivo');
  assert.equal((await leerSesion(sw, id)).estado, 'terminada');
  ext.sw = sw;
});

test('guardián: la vista no registra onMessage (el orquestador difunde a todas las páginas)', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'vista', 'vista.js'), 'utf8');
  assert.equal(/onMessage/.test(fuente), false);
});

test('recuperación: terminadas sin vista se abren una sola vez; sin trozos se borran; con vista no', T, async () => {
  const { sw } = ext;
  const id = await clonar(plantilla.id);
  const vacia = await sw.evaluate(async () => {
    const x = crypto.randomUUID();
    await self.grabador.almacen.crearSesion({ id: x, estado: 'grabando', creada: Date.now(), superficie: 'monitor', mime: 'video/mp4', avisos: [] });
    return x;
  });
  const [a, b] = await sw.evaluate(() => Promise.all([self.grabador.recuperarHuerfanas(), self.grabador.recuperarHuerfanas()]));
  assert.deepEqual([...a, ...b], [id], 'solo la terminada sin vista, una vez');
  await esperarVista(id, { recuperada: true });
  assert.equal(await leerSesion(sw, vacia), undefined, 'la vacía se borra');
  assert.ok(await leerSesion(sw, plantilla.id), 'la que tiene vista sigue');

  // Ya cargadas, las vistas se reconocen por sus contextos aunque no quede el registro reciente.
  await sw.evaluate(() => chrome.storage.session.remove('vistasRecientes'));
  assert.deepEqual(await recuperar(sw), []);
  await dormir(500);
  assert.equal(vistasDe(id).length, 1);
  assert.equal(vistasDe(plantilla.id).length, 1);

  // La avisada como recuperada pero que terminó bien no dice que se cortó.
  const p = vistasDe(id)[0];
  const avisos = await p.locator('#avisos li').allTextContents();
  assert.equal(avisos.length, 1, JSON.stringify(avisos));
  assert.ok(avisos[0].startsWith('Grabación recuperada') && !/final/.test(avisos[0]), avisos[0]);
});
