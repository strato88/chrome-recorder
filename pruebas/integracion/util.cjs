'use strict';
// Arnés de las pruebas de integración: servidor estático del repo, lanzador de
// Chrome con la extensión cargada y envoltorio de ffprobe.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');

const TIPOS = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Sirve la raíz del repo por http en 127.0.0.1 y un puerto libre.
function servirRepo() {
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = decodeURIComponent(new URL(peticion.url, 'http://x').pathname);
    const fichero = path.resolve(RAIZ, '.' + ruta);
    if (fichero !== RAIZ && !fichero.startsWith(RAIZ + path.sep)) {
      respuesta.writeHead(403).end();
      return;
    }
    fs.readFile(fichero, (error, datos) => {
      if (error) { respuesta.writeHead(404).end(); return; }
      respuesta.writeHead(200, {
        'Content-Type': TIPOS[path.extname(fichero)] || 'application/octet-stream',
      });
      respuesta.end(datos);
    });
  });
  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      resolver({
        url: `http://127.0.0.1:${servidor.address().port}`,
        cerrar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(() => r()); }),
      });
    });
  });
}

// Copia la extensión a un directorio temporal con permisos de host añadidos.
function copiaConPermisosHost() {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'grabador-ext-'));
  const excluidos = new Set(['.git', '.superpowers', 'node_modules', 'pruebas', 'docs']);
  fs.cpSync(RAIZ, destino, {
    recursive: true,
    filter: (origen) => !excluidos.has(path.relative(RAIZ, origen).split(path.sep)[0]),
  });
  const rutaManifiesto = path.join(destino, 'manifest.json');
  const manifiesto = JSON.parse(fs.readFileSync(rutaManifiesto, 'utf8'));
  manifiesto.host_permissions = ['http://*/*', 'https://*/*'];
  fs.writeFileSync(rutaManifiesto, JSON.stringify(manifiesto, null, 2));
  return destino;
}

// Lanza Chrome con la extensión cargada. Devuelve {ctx, sw, extId, cerrar}.
async function lanzarExtension({ args = [], permisosHost = false } = {}) {
  const temporal = permisosHost ? copiaConPermisosHost() : null;
  const ext = temporal || RAIZ;
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: null,
    args: [
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      '--force-device-scale-factor=2',
      ...args,
    ],
  });
  const cerrar = async () => {
    await ctx.close();
    if (temporal) fs.rmSync(temporal, { recursive: true, force: true });
  };
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;
    await sw.evaluate(() => chrome.storage.local.set({ modoPrueba: true }));
    return { ctx, sw, extId, cerrar };
  } catch (e) {
    await cerrar();
    throw e;
  }
}

// Ejecuta ffprobe y devuelve su salida JSON ya interpretada.
function ffprobe(ruta) {
  const salida = execFileSync(
    'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', ruta],
    { encoding: 'utf8' },
  );
  return JSON.parse(salida);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Repite fn hasta que devuelva algo verdadero; si no, falla con `que` y el último valor.
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

module.exports = { servirRepo, lanzarExtension, ffprobe, dormir, esperar };
