import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (ruta) => JSON.parse(readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8'));
const manifest = leer('manifest.json');
const mensajes = leer('_locales/es/messages.json');

test('permisos exactos', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'offscreen', 'scripting', 'storage', 'unlimitedStorage']);
});

test('sin permisos de host', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
});

test('version minima', () => {
  assert.equal(manifest.minimum_chrome_version, '126');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.default_locale, 'es');
});

test('atajos', () => {
  assert.equal(manifest.commands['alternar-grabacion'].suggested_key.default, 'Alt+Shift+R');
  assert.equal(manifest.commands['alternar-pausa'].suggested_key.default, 'Alt+Shift+P');
});

test('textos existen', () => {
  const claves = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
  assert.ok(claves.length > 0);
  for (const clave of claves) {
    assert.ok(mensajes[clave], `falta la clave ${clave} en messages.json`);
  }
});

test('sin recursos accesibles', () => {
  assert.equal(manifest.web_accessible_resources, undefined);
});
