import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { iconosDeFase } from '../background/indicadores.js';

const ruta = (r) => new URL(`../${r}`, import.meta.url);
const leer = (r) => readFileSync(ruta(r), 'utf8');
const manifest = JSON.parse(leer('manifest.json'));
const TAMANOS = [16, 32, 48, 128];

test('existen los 8 iconos y sus dimensiones coinciden con el nombre', () => {
  for (const tipo of ['reposo', 'grabando']) {
    for (const t of TAMANOS) {
      const r = `iconos/${tipo}-${t}.png`;
      assert.ok(existsSync(ruta(r)), `falta ${r}`);
      const b = readFileSync(ruta(r));
      assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${r} no es PNG`);
      assert.equal(b.readUInt32BE(16), t, `${r}: ancho`);
      assert.equal(b.readUInt32BE(20), t, `${r}: alto`);
    }
  }
});

test('el manifiesto apunta a los iconos de reposo', () => {
  for (const t of TAMANOS) {
    assert.equal(manifest.icons[t], `iconos/reposo-${t}.png`);
    assert.equal(manifest.action.default_icon[t], `iconos/reposo-${t}.png`);
  }
});

test('las letras son woff2 y llevan su licencia OFL', () => {
  for (const f of ['Outfit-Variable', 'JetBrainsMono-Variable']) {
    const b = readFileSync(ruta(`fuentes/${f}.woff2`));
    assert.equal(b.subarray(0, 4).toString('latin1'), 'wOF2', `${f} no es woff2`);
  }
  assert.match(leer('fuentes/OFL-Outfit.txt'), /SIL OPEN FONT LICENSE/i);
  assert.match(leer('fuentes/OFL-JetBrainsMono.txt'), /SIL OPEN FONT LICENSE/i);
});

const TOKENS = {
  azul: '#2E86AB', 'azul-tinte': '#E6F2F7', tinta: '#1C2634', secundario: '#4A5866',
  linea: '#DCE2E8', fondo: '#FFFFFF', hundido: '#FBFCFD', rojo: '#C8302B',
  'rojo-tinte': '#FBEAE9', ambar: '#8A5A00',
};

// Bloque `{ ... }` que sigue a la primera aparición de `cabecera`.
function bloque(css, cabecera, desde = 0) {
  const i = css.indexOf(cabecera, desde);
  assert.ok(i >= 0, `no hay ${cabecera}`);
  const ini = css.indexOf('{', i);
  let nivel = 0;
  for (let j = ini; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    if (css[j] === '}' && --nivel === 0) return css.slice(ini + 1, j);
  }
  throw new Error('bloque sin cerrar');
}

test('estilo.css define cada token en :root y en el bloque oscuro', () => {
  const css = leer('comun/estilo.css');
  const claro = bloque(css, ':root');
  for (const [n, v] of Object.entries(TOKENS)) {
    assert.match(claro, new RegExp(`--${n}\\s*:\\s*${v}\\s*;`, 'i'), `--${n} en :root`);
  }
  assert.match(claro, /--f-texto\s*:\s*"Outfit",\s*system-ui,\s*sans-serif/);
  assert.match(claro, /--f-mono\s*:\s*"JetBrains Mono",\s*ui-monospace,\s*monospace/);

  const oscuro = bloque(bloque(css, '@media (prefers-color-scheme: dark)'), ':root');
  for (const n of Object.keys(TOKENS)) { // las letras no cambian con el tema
    assert.match(oscuro, new RegExp(`--${n}\\s*:`), `--${n} en el bloque oscuro`);
  }
});

test('estilo.css carga las letras empaquetadas y define las clases base', () => {
  const css = leer('comun/estilo.css');
  assert.match(css, /url\("\.\.\/fuentes\/Outfit-Variable\.woff2"\)/);
  assert.match(css, /url\("\.\.\/fuentes\/JetBrainsMono-Variable\.woff2"\)/);
  for (const c of ['.btn', '.btn-grabar', '.campo', '.aviso', '.mono']) {
    assert.ok(css.includes(c), `falta la clase ${c}`);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /tabular-nums/);
  assert.doesNotMatch(css, /https?:\/\//, 'sin recursos remotos');
});

test('el icono sigue a la fase: grabando en cuenta atrás, grabación y pausa', () => {
  for (const fase of ['cuenta_atras', 'grabando', 'en_pausa']) {
    assert.deepEqual(iconosDeFase(fase), {
      16: 'iconos/grabando-16.png', 32: 'iconos/grabando-32.png',
      48: 'iconos/grabando-48.png', 128: 'iconos/grabando-128.png',
    }, fase);
  }
  for (const fase of ['inactivo', 'eligiendo', 'cerrando', undefined]) {
    assert.equal(iconosDeFase(fase)[16], 'iconos/reposo-16.png', String(fase));
  }
});
