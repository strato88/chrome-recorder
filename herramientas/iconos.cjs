'use strict';
// Genera iconos/{reposo,grabando}-{16,32,48,128}.png desde iconos/iconos.svg con
// Playwright (fondo transparente). Uso: node herramientas/iconos.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const TAMANOS = [16, 32, 48, 128];
const VARIANTES = ['reposo', 'grabando'];

async function main() {
  const svg = fs.readFileSync(path.join(RAIZ, 'iconos', 'iconos.svg'), 'utf8');
  const navegador = await chromium.launch();
  try {
    for (const variante of VARIANTES) {
      for (const t of TAMANOS) {
        const pagina = await navegador.newPage({ viewport: { width: t, height: t } });
        const dibujo = svg
          .replace('<svg ', `<svg width="${t}" height="${t}"${variante === 'grabando' ? ' class="grabando"' : ''} `);
        await pagina.setContent(
          `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${dibujo}`);
        const destino = path.join(RAIZ, 'iconos', `${variante}-${t}.png`);
        await pagina.screenshot({ path: destino, omitBackground: true, clip: { x: 0, y: 0, width: t, height: t } });
        await pagina.close();
        console.log('escrito', path.relative(RAIZ, destino));
      }
    }
  } finally {
    await navegador.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
