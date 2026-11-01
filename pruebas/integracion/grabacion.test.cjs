'use strict';
// Grabación de extremo a extremo: orquestador (service worker) + grabadora (offscreen).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lanzarExtension, ffprobe } = require('./util.cjs');

const PANTALLA = { fuente: 'monitor', audio: false, calidad: 'normal', fps: 30 };
const T = { timeout: 90000 };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar(fn, { timeout = 20000, intervalo = 100, que = 'condición' } = {}) {
  const fin = Date.now() + timeout;
  let ultimo;
  while (Date.now() < fin) {
    ultimo = await fn();
    if (ultimo) return ultimo;
    await dormir(intervalo);
  }
  throw new Error(`Tiempo agotado esperando ${que} (último valor: ${JSON.stringify(ultimo)})`);
}

// Funciones que se evalúan dentro del service worker.
const estado = (sw) => sw.evaluate(() => self.grabador.leerEstado());
const aplicar = (sw, evento, cambios) => sw.evaluate(
  ([e, c]) => self.grabador.aplicar(e, c), [evento, cambios ?? {}],
);
const iniciar = (sw, config = PANTALLA) => aplicar(sw, 'iniciar', { config, tituloPestana: '', pestanaId: null });
const offscreens = (sw) => sw.evaluate(
  async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length,
);
const sesiones = (sw) => sw.evaluate(() => self.grabador.almacen.listarSesiones());
const alOffscreen = (sw, tipo) => sw.evaluate(async (t) => {
  const { sesionId } = await self.grabador.leerEstado();
  return chrome.runtime.sendMessage({ destino: 'offscreen', tipo: t, sesionId });
}, tipo);

const esperarFase = (sw, fase, timeout = 20000) => esperar(
  async () => { const e = await estado(sw); return e.fase === fase && e; },
  { timeout, que: `la fase ${fase}` },
);

// Páginas de vista previa abiertas (de una sesión o de cualquiera).
const vistas = (ctx, sesionId = '') => ctx.pages().filter((p) => p.url().includes(`/vista/vista.html?sesion=${sesionId}`));

// Espera a que el service worker abra la vista previa de la sesión y a que cargue.
async function esperarVista(ctx, sesionId, timeout = 30000) {
  const pagina = await esperar(() => vistas(ctx, sesionId)[0], { timeout, que: 'la pestaña de vista' });
  await pagina.waitForSelector('#app[data-listo]');
  return pagina;
}

// Ninguna vista previa abierta (con margen para una pestaña que aún se estuviera creando).
async function sinVistas(ctx) {
  await dormir(1000);
  assert.deepEqual(vistas(ctx).map((p) => p.url()), [], 'no se abre la vista');
}

// Lee los trozos de la sesión a través del service worker y los escribe a un MP4 temporal.
async function volcarMp4(sw, sesionId) {
  const base64 = await sw.evaluate(async (id) => {
    const trozos = await self.grabador.almacen.leerTrozos(id);
    const bytes = new Uint8Array(await new Blob(trozos).arrayBuffer());
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binario);
  }, sesionId);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabacion-'));
  const ruta = path.join(dir, 'video.mp4');
  fs.writeFileSync(ruta, Buffer.from(base64, 'base64'));
  return { ruta, borrar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

async function sondear(sw, sesionId) {
  const mp4 = await volcarMp4(sw, sesionId);
  try {
    const datos = ffprobe(mp4.ruta);
    return {
      video: datos.streams.find((s) => s.codec_type === 'video'),
      audio: datos.streams.find((s) => s.codec_type === 'audio'),
      duracion: Number(datos.format.duration),
    };
  } finally {
    mp4.borrar();
  }
}

// Deja la extensión en reposo y sin restos entre pruebas.
async function limpiar(ext) {
  const { sw, ctx } = ext;
  const e = await estado(sw);
  if (e.fase === 'grabando' || e.fase === 'en_pausa') await aplicar(sw, 'detener');
  else if (e.fase === 'eligiendo' || e.fase === 'cuenta_atras') await aplicar(sw, 'cancelar');
  await esperarFase(sw, 'inactivo', 30000);
  await sw.evaluate(async () => {
    for (const s of await self.grabador.almacen.listarSesiones()) await self.grabador.almacen.borrarSesion(s.id);
    await chrome.storage.local.remove('limitesPrueba');
    await chrome.storage.local.set({ modoPrueba: true });
  });
  for (const p of ctx.pages().slice(1)) await p.close();
}

// ---------------------------------------------------------------------------
// Pantalla entera (la mayoría de los casos comparten un Chrome)
// ---------------------------------------------------------------------------

let ext;

before(async () => {
  ext = await lanzarExtension({ args: ['--auto-select-desktop-capture-source=Entire screen'] });
});

after(async () => { await ext?.cerrar(); });

beforeEach(async () => { if (ext) await limpiar(ext); });

test('graba pantalla', T, async () => {
  const { sw, ctx } = ext;
  const inicial = await iniciar(sw);
  assert.equal(inicial.fase, 'eligiendo');
  await esperarFase(sw, 'grabando');
  await dormir(5000);
  await aplicar(sw, 'detener');
  await esperarVista(ctx, inicial.sesionId);
  const fin = await esperarFase(sw, 'inactivo');
  assert.equal(fin.error, null);
  const sesion = await sw.evaluate((id) => self.grabador.almacen.leerSesion(id), inicial.sesionId);
  assert.equal(sesion.estado, 'terminada');
  assert.ok(sesion.duracionMs > 3000, `duracionMs ${sesion.duracionMs}`);
  assert.ok(sesion.bytes > 0);
  const r = await sondear(sw, inicial.sesionId);
  assert.equal(r.video.codec_name, 'h264');
  assert.equal(r.video.width, 1440);
  assert.equal(r.video.height, 900);
  assert.ok(r.duracion >= 4 && r.duracion <= 7, `duración ${r.duracion}`);
  assert.equal(r.audio, undefined, 'sin pista de audio');
  assert.equal(await offscreens(sw), 0);
});

test('doble inicio', T, async () => {
  const { sw } = ext;
  const [a, b] = await sw.evaluate((config) => Promise.all([
    self.grabador.aplicar('iniciar', { config, tituloPestana: '', pestanaId: null }),
    self.grabador.aplicar('iniciar', { config, tituloPestana: '', pestanaId: null }),
  ]), PANTALLA);
  assert.equal(a.fase, 'eligiendo');
  assert.equal(b, null);
  assert.equal(await offscreens(sw), 1);
});

test('dejar de compartir en la cuenta atrás', T, async () => {
  const { sw } = ext;
  await iniciar(sw);
  await esperarFase(sw, 'cuenta_atras');
  await alOffscreen(sw, 'probar_fin');
  await esperarFase(sw, 'inactivo');
  await esperar(async () => (await offscreens(sw)) === 0, { que: 'sin offscreen' });
  assert.deepEqual(await sesiones(sw), []);
});

test('estado sobrevive', T, async () => {
  const { sw, ctx, extId } = ext;
  await iniciar(sw);
  await esperarFase(sw, 'grabando');
  const pagina = await ctx.newPage();
  await pagina.goto(`chrome-extension://${extId}/popup/popup.html`);
  const guardado = await pagina.evaluate(async () => (await chrome.storage.session.get('estado')).estado);
  assert.equal(guardado.fase, 'grabando');
  assert.equal(typeof guardado.inicioMs, 'number');
});

test('linux sin modo de prueba', T, async () => {
  const { sw } = ext;
  await sw.evaluate(() => chrome.storage.local.set({ modoPrueba: false }));
  await iniciar(sw);
  const e = await esperar(async () => {
    const x = await estado(sw);
    return x.fase === 'inactivo' && x.error && x;
  }, { que: 'el error linux' });
  assert.equal(e.error.codigo, 'linux');
  await esperar(async () => (await offscreens(sw)) === 0, { que: 'sin offscreen' });
  assert.deepEqual(await sesiones(sw), []);
});

test('pausa', T, async () => {
  const { sw, ctx } = ext;
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  await dormir(2000);
  await aplicar(sw, 'pausar');
  await dormir(500);
  const antes = (await estado(sw)).ms;
  await dormir(2500);
  const pausado = await estado(sw);
  assert.equal(pausado.fase, 'en_pausa');
  assert.equal(pausado.ms, antes, 'ms no avanza en pausa');
  await aplicar(sw, 'reanudar');
  await dormir(2000);
  await aplicar(sw, 'detener');
  await esperarVista(ctx, inicial.sesionId);
  await esperarFase(sw, 'inactivo');
  const r = await sondear(sw, inicial.sesionId);
  assert.equal(r.video.codec_name, 'h264');
  assert.ok(r.duracion >= 3 && r.duracion <= 5, `duración ${r.duracion}`);
});

test('cancelar en la cuenta atrás', T, async () => {
  const { sw } = ext;
  await iniciar(sw);
  await esperarFase(sw, 'cuenta_atras');
  const e = await aplicar(sw, 'cancelar');
  assert.equal(e.fase, 'inactivo');
  assert.equal(await offscreens(sw), 0);
  assert.deepEqual(await sesiones(sw), []);
  await dormir(3500); // la cuenta atrás ya no debe arrancar la grabación
  assert.equal((await estado(sw)).fase, 'inactivo');
});

test('límites', T, async () => {
  const { sw, ctx } = ext;
  await sw.evaluate(() => chrome.storage.local.set({ limitesPrueba: { avisoMs: 2000, maxMs: 4000 } }));
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  await esperar(async () => (await estado(sw)).avisos.includes('quedan_5_min'), { que: 'el aviso quedan_5_min' });
  await esperarVista(ctx, inicial.sesionId);
  const fin = await esperarFase(sw, 'inactivo');
  assert.ok(fin.avisos.includes('quedan_5_min'));
  const r = await sondear(sw, inicial.sesionId);
  assert.equal(r.video.codec_name, 'h264');
  assert.ok(r.duracion >= 3 && r.duracion <= 7, `duración ${r.duracion}`);
});

test('vigilante', T, async () => {
  const { sw, ctx } = ext;
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'cuenta_atras');
  await alOffscreen(sw, 'probar_vigilante');
  await esperarFase(sw, 'grabando');
  await esperar(async () => (await estado(sw)).avisos.includes('reintento'), { timeout: 15000, que: 'el aviso reintento' });
  await esperar(async () => (await estado(sw)).bytes > 0, { timeout: 15000, que: 'el primer trozo tras reintentar' });
  await dormir(1000);
  await aplicar(sw, 'detener');
  await esperarVista(ctx, inicial.sesionId);
  const fin = await esperarFase(sw, 'inactivo');
  assert.equal(fin.error, null);
  const r = await sondear(sw, inicial.sesionId);
  assert.equal(r.video.codec_name, 'h264');
  assert.ok(r.duracion > 1, `duración ${r.duracion}`);
});

// Ronda de corrección 1 ----------------------------------------------------

// Cancelar no debe esperar a que la grabadora conteste a través de la cola.
async function cancelarRapido(sw, faseEsperada) {
  const t0 = Date.now();
  const e = await aplicar(sw, 'cancelar');
  const msCancelar = Date.now() - t0;
  assert.equal(e?.fase, 'inactivo', `cancelar desde ${faseEsperada}`);
  assert.ok(msCancelar < 1000, `cancelar tardó ${msCancelar} ms`);
  const t1 = Date.now();
  const otra = await iniciar(sw);
  const msIniciar = Date.now() - t1;
  assert.equal(otra?.fase, 'eligiendo');
  assert.ok(msIniciar < 1000, `iniciar tras cancelar tardó ${msIniciar} ms`);
}

test('cancelar en eligiendo no se bloquea', T, async () => {
  const { sw } = ext;
  const e = await iniciar(sw);
  assert.equal(e.fase, 'eligiendo');
  await cancelarRapido(sw, 'eligiendo');
});

test('cancelar en la cuenta atrás no se bloquea', T, async () => {
  const { sw } = ext;
  await iniciar(sw);
  await esperarFase(sw, 'cuenta_atras');
  await cancelarRapido(sw, 'cuenta_atras');
});

test('un error de escritura al detener conserva lo grabado', T, async () => {
  const { sw, ctx } = ext;
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  await esperar(async () => (await estado(sw)).bytes > 0, { que: 'el primer trozo' });
  await dormir(4500); // unos cuantos trozos escritos antes del fallo
  const antes = (await estado(sw)).bytes;
  await alOffscreen(sw, 'probar_sin_espacio'); // el siguiente anadirTrozo lanza QuotaExceededError
  await aplicar(sw, 'detener'); // puede llegar tarde si un trozo periódico ya ha fallado
  await esperarVista(ctx, inicial.sesionId);
  const fin = await esperarFase(sw, 'inactivo');
  assert.equal(fin.error?.codigo, 'sin_espacio');
  const sesion = await sw.evaluate((id) => self.grabador.almacen.leerSesion(id), inicial.sesionId);
  assert.equal(sesion?.estado, 'terminada');
  assert.ok(sesion.bytes >= antes && sesion.bytes > 0, `bytes ${sesion.bytes} (antes ${antes})`);
  const r = await sondear(sw, inicial.sesionId);
  assert.equal(r.video.codec_name, 'h264');
  assert.ok(r.duracion > 1, `duración ${r.duracion}`);
  assert.equal(await offscreens(sw), 0);
});

test('si el recorder no arranca, se vuelve a reposo sin restos', T, async () => {
  const { sw } = ext;
  await iniciar(sw);
  await esperarFase(sw, 'cuenta_atras');
  await alOffscreen(sw, 'probar_recorder_roto');
  const fin = await esperar(async () => {
    const x = await estado(sw);
    return x.fase === 'inactivo' && x;
  }, { timeout: 15000, que: 'la vuelta a inactivo' });
  assert.equal(fin.error?.codigo, 'grabadora');
  await esperar(async () => (await offscreens(sw)) === 0, { que: 'sin offscreen' });
  assert.deepEqual(await sesiones(sw), []);
  await sinVistas(ext.ctx);
});

// Ronda de corrección 1 (Tarea 7) -------------------------------------------

// Parar casi al instante de empezar nunca es silencioso: o hay vista con un vídeo
// válido o el estado acaba en `inactivo` con el error `sin_video` y sin sesión.
async function paradaInmediata(ext, espera) {
  const { sw, ctx } = ext;
  const inicial = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  await dormir(espera);
  await aplicar(sw, 'detener');
  const fin = await esperarFase(sw, 'inactivo', 30000);
  await esperar(async () => (await offscreens(sw)) === 0, { que: 'sin offscreen' });
  if (fin.error?.codigo !== 'sin_video') {
    assert.equal(fin.error, null);
    await esperarVista(ctx, inicial.sesionId);
    const sesion = await sw.evaluate((id) => self.grabador.almacen.leerSesion(id), inicial.sesionId);
    assert.equal(sesion.estado, 'terminada');
    const r = await sondear(sw, inicial.sesionId);
    assert.equal(r.video.codec_name, 'h264');
    return 'vista';
  }
  assert.deepEqual(await sesiones(sw), []);
  await sinVistas(ctx);
  return 'sin_video';
}

// Chrome no entrega ningún trozo si se para antes de que el codificador saque el primer
// fotograma (sondeado: 0 ms casi nunca, 50 ms a veces, ≥100 ms siempre; requestData() antes
// de stop() no cambia nada). Por eso ese caso se declara con `sin_video`, no se esconde.
test('parada inmediata', T, async () => {
  for (const espera of [0, 300]) {
    await limpiar(ext);
    const resultado = await paradaInmediata(ext, espera);
    console.log(`# parada inmediata (${espera} ms): ${resultado}`);
  }
});

test('terminado sin vídeo: error solo si ya se estaba grabando', T, async () => {
  const { sw } = ext;
  let e = await iniciar(sw);
  await esperarFase(sw, 'grabando');
  e = await aplicar(sw, 'terminado', { sesionId: e.sesionId, hayVideo: false });
  assert.equal(e.fase, 'inactivo');
  assert.equal(e.error?.codigo, 'sin_video');
  await sinVistas(ext.ctx);
  // Cancelar o dejar de compartir en la cuenta atrás no es un error.
  await limpiar(ext);
  e = await iniciar(sw);
  await esperarFase(sw, 'cuenta_atras');
  e = await aplicar(sw, 'terminado', { sesionId: e.sesionId, hayVideo: false });
  assert.equal(e.fase, 'inactivo');
  assert.equal(e.error, null);
});

// ---------------------------------------------------------------------------
// Pestaña con audio (otro Chrome: el selector se elige por título)
// ---------------------------------------------------------------------------

test('pestaña con audio', T, async () => {
  const pestana = await lanzarExtension({
    args: ['--auto-select-tab-capture-source-by-title=Prueba', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const { sw, ctx } = pestana;
    const pagina = await ctx.newPage();
    await pagina.setContent(`<title>Prueba</title><h1>Prueba</h1><script>
      const c = new AudioContext(); const o = c.createOscillator();
      o.frequency.value = 440; o.connect(c.destination); o.start();
    </script>`);
    await pagina.waitForFunction(() => document.title === 'Prueba');
    const inicial = await iniciar(sw, { fuente: 'browser', audio: true, calidad: 'normal', fps: 30 });
    const grabando = await esperarFase(sw, 'grabando');
    assert.equal(grabando.conAudio, true);
    assert.ok(!grabando.avisos.includes('sin_audio'));
    await dormir(3000);
    await aplicar(sw, 'detener');
    await esperarVista(ctx, inicial.sesionId);
    await esperarFase(sw, 'inactivo');
    const r = await sondear(sw, inicial.sesionId);
    assert.equal(r.video.codec_name, 'h264');
    assert.ok(r.audio, 'hay pista de audio');
    assert.equal(r.audio.codec_name, 'opus');
  } finally {
    await pestana.cerrar();
  }
});
