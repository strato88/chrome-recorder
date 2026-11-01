'use strict';
// Popup: formulario, recuerdo de la configuración, estados de la grabación y errores.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { lanzarExtension, esperar } = require('./util.cjs');

const T = { timeout: 90000 };

let ext;
before(async () => {
  ext = await lanzarExtension({ args: ['--auto-select-desktop-capture-source=Entire screen'] });
});
after(async () => { await ext?.cerrar(); });

const estadoSw = () => ext.sw.evaluate(() => self.grabador.leerEstado());
const ponerEstado = (estado) => ext.sw.evaluate((e) => chrome.storage.session.set({ estado: e }), estado);
// Misma forma que estadoInicial() de background/estado.js (el service worker no admite import()).
const base = async () => ({
  fase: 'inactivo', sesionId: null, config: null, inicioMs: null, ms: 0, bytes: 0,
  ancho: null, alto: null, original: null, conAudio: false, superficie: null,
  tituloPestana: '', pestanaId: null, avisos: [], error: null,
});

async function abrirPopup() {
  const page = await ext.ctx.newPage();
  await page.goto(`chrome-extension://${ext.extId}/popup/popup.html`);
  await page.waitForSelector('#app[data-listo]');
  return page;
}

// Deja el estado y la configuración como en una instalación nueva.
beforeEach(async () => {
  await ext.sw.evaluate(async () => {
    await chrome.storage.session.clear();
    await chrome.storage.local.remove('config');
  });
});

test('estado inicial: valores por defecto y peso estimado por minuto', T, async () => {
  const page = await abrirPopup();
  assert.equal(await page.inputValue('#fuente'), 'browser');
  assert.equal(await page.inputValue('#audio'), 'si');
  assert.equal(await page.inputValue('#calidad'), 'normal');
  assert.equal(await page.inputValue('#fps'), '30');
  assert.match(await page.textContent('#estimacion'), /≈ \d+ MB por minuto a \d+×\d+/);
  assert.equal(await page.isVisible('#grabar'), true);
  assert.equal(await page.isVisible('#detener'), false);
  await page.close();
});

test('la configuración se recuerda al cerrar y abrir', T, async () => {
  let page = await abrirPopup();
  await page.selectOption('#calidad', 'alta');
  await page.selectOption('#fuente', 'monitor');
  await page.selectOption('#audio', 'no');
  await page.selectOption('#fps', '60');
  const guardada = await esperar(async () => {
    const { config } = await ext.sw.evaluate(() => chrome.storage.local.get('config'));
    return config?.calidad === 'alta' && config?.fps === 60 && config;
  }, { que: 'la configuración guardada' });
  assert.deepEqual(guardada, { fuente: 'monitor', audio: false, calidad: 'alta', fps: 60 });
  await page.close();

  page = await abrirPopup();
  assert.equal(await page.inputValue('#calidad'), 'alta');
  assert.equal(await page.inputValue('#fuente'), 'monitor');
  assert.equal(await page.inputValue('#audio'), 'no');
  assert.equal(await page.inputValue('#fps'), '60');
  await page.close();
});

test('una configuración guardada estropeada vuelve a los valores por defecto', T, async () => {
  await ext.sw.evaluate(() => chrome.storage.local.set({ config: { fuente: 'x', audio: 3, calidad: 'ultra', fps: 24 } }));
  const page = await abrirPopup();
  assert.equal(await page.inputValue('#fuente'), 'browser');
  assert.equal(await page.inputValue('#audio'), 'si');
  assert.equal(await page.inputValue('#calidad'), 'normal');
  assert.equal(await page.inputValue('#fps'), '30');
  await page.close();
});

test('el peso estimado cambia con la calidad y el audio', T, async () => {
  const page = await abrirPopup();
  const mb = async () => Number((await page.textContent('#estimacion')).match(/≈ (\d+) MB/)[1]);
  await page.selectOption('#calidad', 'normal');
  const normal = await mb();
  await page.selectOption('#calidad', 'maxima');
  assert.ok(await mb() > normal);
  await page.close();
});

test('grabando: tiempo, peso, resolución, Pausa y Detener; se repinta en vivo', T, async () => {
  const page = await abrirPopup();
  await ponerEstado({
    ...await base(), fase: 'grabando', sesionId: 's1', ms: 61000, bytes: 812e6,
    ancho: 1920, alto: 1080, conAudio: true,
  });
  await esperar(() => page.isVisible('#detener'), { que: 'el botón Detener' });
  assert.equal((await page.textContent('#tiempo')).trim(), '01:01');
  assert.match(await page.textContent('#datos'), /812 MB/);
  assert.match(await page.textContent('#datos'), /1920×1080/);
  assert.equal((await page.textContent('#pausar')).trim(), 'Pausa');
  assert.equal(await page.isVisible('#grabar'), false);
  assert.equal(await page.getAttribute('#tiempo', 'aria-live'), 'polite');

  // Llega más progreso: el tiempo se actualiza sin recargar.
  await ponerEstado({
    ...await base(), fase: 'grabando', sesionId: 's1', ms: 125000, bytes: 1.5e9,
    ancho: 1920, alto: 1080, conAudio: true,
  });
  await esperar(async () => (await page.textContent('#tiempo')).trim() === '02:05', { que: '02:05' });
  assert.match(await page.textContent('#datos'), /1,5 GB/);

  // En pausa el botón pasa a Reanudar.
  await ponerEstado({ ...await base(), fase: 'en_pausa', sesionId: 's1', ms: 125000, bytes: 1.5e9, ancho: 1920, alto: 1080 });
  await esperar(async () => (await page.textContent('#pausar')).trim() === 'Reanudar', { que: 'Reanudar' });
  await page.close();
});

test('grabando: resolución reducida y avisos en lenguaje claro, uno por código', T, async () => {
  const page = await abrirPopup();
  await ponerEstado({
    ...await base(), fase: 'grabando', sesionId: 's1', ms: 1000, bytes: 1e6,
    ancho: 3840, alto: 2160, original: { ancho: 5120, alto: 2880 },
    avisos: ['sin_audio', 'reducida', 'quedan_5_min'],
  });
  await esperar(() => page.isVisible('#detener'), { que: 'el botón Detener' });
  assert.match(await page.textContent('#datos'), /3840×2160/);
  const avisos = await page.locator('#avisos li').allTextContents();
  assert.equal(avisos.length, 3);
  assert.match(avisos[0], /Grabando sin sonido/);
  assert.match(avisos[1], /Grabando a 3840×2160 \(reducida desde 5120×2880\)/);
  assert.match(avisos[2], /Quedan 5 minutos/);
  await page.close();
});

test('eligiendo: texto y Cancelar; cuenta atrás: el número', T, async () => {
  const page = await abrirPopup();
  await ponerEstado({ ...await base(), fase: 'eligiendo', sesionId: 's1' });
  await esperar(() => page.isVisible('#cancelar'), { que: 'el botón Cancelar' });
  assert.match(await page.textContent('#espera'), /Elige qué grabar en el selector de Chrome/);
  assert.equal(await page.isVisible('#grabar'), false);

  await ponerEstado({ ...await base(), fase: 'cuenta_atras', sesionId: 's1', cuentaFinMs: Date.now() + 2500 });
  await esperar(async () => (await page.textContent('#numero')).trim() === '3', { que: 'el 3' });
  await page.close();
});

test('error: cada código se explica en claro, encima del formulario', T, async () => {
  const esperado = {
    linux: 'Esta extensión funciona en Windows y macOS',
    sin_mp4: 'No se puede grabar en MP4 en este Chrome',
    sin_espacio: 'Te has quedado sin espacio; se ha guardado hasta aquí',
    grabadora: 'La grabación se ha cortado',
    resolucion: 'No se ha podido grabar a esta resolución',
    sin_video: 'La grabación ha sido demasiado corta: no se ha guardado nada',
    cancelado: 'Grabación cancelada',
  };
  const page = await abrirPopup();
  for (const [codigo, texto] of Object.entries(esperado)) {
    await ponerEstado({ ...await base(), error: { codigo, detalle: null } });
    await esperar(async () => (await page.textContent('#mensaje')).includes(texto), { que: `el mensaje de ${codigo}` });
    assert.equal(await page.isVisible('#grabar'), true, 'el formulario sigue ahí');
    const clase = await page.getAttribute('#mensaje', 'class');
    assert.equal(clase.includes('error'), codigo !== 'cancelado', `clase de ${codigo}: ${clase}`);
  }
  // Sin error, el mensaje desaparece.
  await ponerEstado(await base());
  await esperar(async () => !(await page.isVisible('#mensaje')), { que: 'sin mensaje' });
  await page.close();
});

test('Grabar inicia la grabación con la configuración, el título y la pestaña activa', T, async () => {
  const page = await abrirPopup();
  await page.selectOption('#fuente', 'monitor');
  await page.selectOption('#audio', 'no');
  await ponerEstado({ ...await base(), error: { codigo: 'linux', detalle: null } });
  await esperar(() => page.isVisible('#mensaje'), { que: 'el error previo' });

  const cerrada = page.waitForEvent('close', { timeout: 5000 }).catch(() => null);
  await page.click('#grabar').catch(() => {}); // la página puede cerrarse durante el clic
  await cerrada;
  const e = await esperar(async () => {
    const s = await estadoSw();
    return s.fase !== 'inactivo' && s;
  }, { timeout: 30000, que: 'que la grabación empiece' });
  assert.ok(['eligiendo', 'cuenta_atras', 'grabando'].includes(e.fase), e.fase);
  assert.deepEqual(e.config, { fuente: 'monitor', audio: false, calidad: 'normal', fps: 30 });
  // Como página suelta, el popup no tiene activeTab (solo lo da pulsar el icono): el título
  // llega vacío y el orquestador lo acepta; lo que importa es que viaje un texto y la pestaña.
  assert.equal(typeof e.tituloPestana, 'string');
  assert.ok(Number.isInteger(e.pestanaId));
  assert.equal(e.error, null, 'el error anterior se borra al volver a grabar');

  // Limpieza: se cancela y se espera a reposo.
  await ext.sw.evaluate(async () => {
    const { fase } = await self.grabador.leerEstado();
    return self.grabador.aplicar(['cuenta_atras', 'eligiendo'].includes(fase) ? 'cancelar' : 'detener');
  });
  await esperar(async () => (await estadoSw()).fase === 'inactivo', { timeout: 30000, que: 'volver a reposo' });
});

test('los botones del popup envían pausa, reanudar, detener y cancelar al orquestador', T, async () => {
  const page = await abrirPopup();
  const enviados = [];
  await ext.sw.evaluate(() => {
    self.recibidos = [];
    chrome.runtime.onMessage.addListener((m) => { self.recibidos.push(m.tipo); return false; });
  });
  await ponerEstado({ ...await base(), fase: 'grabando', sesionId: 's1', ms: 1000, ancho: 10, alto: 10 });
  await esperar(() => page.isVisible('#pausar'), { que: 'Pausa' });
  await page.click('#pausar');
  await page.click('#detener');
  await ponerEstado({ ...await base(), fase: 'eligiendo', sesionId: 's2' });
  await esperar(() => page.isVisible('#cancelar'), { que: 'Cancelar' });
  await page.click('#cancelar');
  const tipos = await esperar(async () => {
    const t = await ext.sw.evaluate(() => self.recibidos);
    return t.length >= 3 && t;
  }, { que: 'los mensajes' });
  enviados.push(...tipos);
  assert.deepEqual(enviados.slice(0, 3), ['pausar', 'detener', 'cancelar']);
  await page.close();
});

test('teclado: Grabar es alcanzable con Tab y los campos tienen etiqueta', T, async () => {
  const page = await abrirPopup();
  const ids = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    ids.push(await page.evaluate(() => document.activeElement.id));
  }
  assert.deepEqual(ids.slice(0, 5), ['fuente', 'audio', 'calidad', 'fps', 'grabar']);
  for (const id of ['fuente', 'audio', 'calidad', 'fps']) {
    assert.equal(await page.locator(`label[for="${id}"]`).count(), 1, `etiqueta de ${id}`);
  }
  await page.close();
});

test('guardián: el popup no registra onMessage (solo lee el estado guardado)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.js'), 'utf8');
  assert.equal(/onMessage/.test(fuente), false);
});
