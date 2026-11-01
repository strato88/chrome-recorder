# Grabador MP4 para Chrome: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** extensión de Chrome MV3 que graba pestaña, ventana o pantalla a MP4 (H.264 + AAC) a resolución nativa, con vista previa y Guardar como.

**Arquitectura:** el service worker es un orquestador sin estado en memoria (todo en `chrome.storage.session`) que gobierna una máquina de estados pura. Un documento offscreen con motivo `DISPLAY_MEDIA` abre el selector con `getDisplayMedia()`, graba con `MediaRecorder` y escribe trozos en IndexedDB. Popup, superposición y vista previa solo leen el estado y envían órdenes.

**Tecnología:** JavaScript sin dependencias ni compilación (módulos ES en la extensión). Pruebas unitarias con `node --test` (Node 22). Pruebas de integración con Playwright y Chrome for Testing bajo Xvfb, como en la Fase 1. `ffprobe` para comprobar los MP4.

**Especificación:** `docs/especificacion.md` (v2). Diagnóstico: `docs/fase1-diagnostico.md`.

## Restricciones globales

- Manifest V3, `minimum_chrome_version` `"126"`, `default_locale` `"es"`.
- Permisos exactos: `offscreen`, `activeTab`, `scripting`, `storage`, `unlimitedStorage`. Sin `host_permissions`, sin `tabCapture`, `desktopCapture` ni `downloads`.
- Sin dependencias en tiempo de ejecución, sin código remoto, sin WebAssembly. `package.json` solo con `"type": "module"`, `"private": true` y los scripts de prueba.
- Todo texto visible en `_locales/es/messages.json`, en castellano, sin `alert`/`confirm`/`prompt`.
- Captura siempre con `getDisplayMedia()` en el offscreen; nunca se pasan `width`/`height`/`maxWidth`/`maxHeight` al pedir la captura.
- Tope: `MAX_PIXELES = 36864 * 256` (9 437 184). Vigilante: 5000 ms. Reintento: ancho máximo 1920.
- Bitrate: ancho × alto × fps × factor; factores `normal 0.07`, `alta 0.10`, `maxima 0.15`; audio 128 000 bps.
- `timeslice` 2000 ms · cuenta atrás 3 s · aviso a 55 min · parada a 60 min.
- Atajos: `alternar-grabacion` `Alt+Shift+R`, `alternar-pausa` `Alt+Shift+P`.
- Nombre: `{titulo}_{AAAA-MM-DD}_{HH-MM}.mp4`; «Ventana» / «Pantalla» / «Grabacion».
- Color: azul `#2E86AB`, tinta `#1C2634`, secundario `#4A5866`, rojo de grabación `#C8302B`; Outfit + JetBrains Mono empaquetadas (popup y vista); la superposición usa letras del sistema (sin `web_accessible_resources`).
- Linux: sin AAC → no se graba, salvo `modoPrueba` (clave `modoPrueba: true` en `chrome.storage.local`, solo la pone el arnés de pruebas) que permite Opus.
- El service worker no guarda estado en variables de módulo: todo se lee y escribe con `leerEstado()` / `guardarEstado()`.

## Puntos de revisión

1. **«Dejar de compartir» durante la cuenta atrás:** debe volver a reposo, cerrar el offscreen y no dejar sesión en IndexedDB. Prueba en la Tarea 6.
2. **Dos «Grabar» seguidos (doble clic o atajo repetido):** una sola grabación y un solo selector. Prueba en la Tarea 4 (tabla) y en la Tarea 6.
3. **Service worker dormido a mitad de grabación:** al despertar no pierde la fase ni el tiempo. Prueba estática en la Tarea 6 (sin `let`/`var` de módulo en el service worker) y la de integración de la Tarea 6, que recarga el estado desde `chrome.storage.session`.
4. **Pestaña de la superposición cerrada o en `chrome://`:** la grabación sigue y la insignia avanza; inyectar en `chrome://` no lanza error. Prueba en la Tarea 7.
5. **Títulos raros** (emoji, 300 caracteres, vacío, solo símbolos, «Nueva pestaña» de `chrome://newtab`): nombre válido en Windows y macOS. Prueba en la Tarea 3.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `manifest.json`, `package.json`, `_locales/es/messages.json`, `.gitignore` | Declaración y textos |
| `comun/config.js` | Constantes y configuración por defecto |
| `comun/calidad.js` | Bitrate, tope, reintento, pesos, formato de tiempo (puro) |
| `comun/codec.js` | Elección del tipo MIME (puro) |
| `comun/nombre.js` | Nombre de archivo (puro) |
| `comun/mensajes.js` | Nombres de mensajes y `enviar()` |
| `comun/almacen.js` | IndexedDB: sesiones y trozos |
| `comun/estilo.css`, `fuentes/`, `iconos/` | Identidad visual |
| `background/estado.js` | Máquina de estados (pura) |
| `background/service-worker.js` | Orquestador |
| `offscreen/grabadora.html`, `offscreen/grabadora.js` | Captura y grabación |
| `superposicion/superposicion.js` | Pastilla y cuenta atrás en la página (script clásico) |
| `popup/` | Configurar, lanzar, controlar |
| `vista/` | Vista previa, guardar, descartar, recuperada |
| `pruebas/*.test.js` | Unitarias (Node) |
| `pruebas/integracion/*.test.cjs`, `pruebas/integracion/util.cjs` | Integración (Playwright + Xvfb) |

Scripts de `package.json`:
- `"test": "node --test pruebas/*.test.js"`
- `"test:integracion": "xvfb-run -a -s \"-screen 0 1440x900x24\" node --test --test-concurrency=1 pruebas/integracion/*.test.cjs"`

---

### Tarea 1: Andamiaje y manifiesto

**Ficheros:**
- Crear: `package.json`, `manifest.json`, `_locales/es/messages.json`, `.gitignore` (`node_modules/`, `*.mp4`), `background/service-worker.js` (vacío con un comentario), `pruebas/manifiesto.test.js`

**Interfaces:**
- Produce: el manifiesto que cargan todas las tareas: `background.service_worker` = `background/service-worker.js` con `"type": "module"`; `action.default_popup` = `popup/popup.html`; `commands` `alternar-grabacion` y `alternar-pausa`; nombre y descripción `__MSG_nombre__`, `__MSG_descripcion__`.

- [ ] **Paso 1: escribir `pruebas/manifiesto.test.js`**

  Pruebas (`node:test` + `node:assert/strict`), leyendo los JSON con `fs`:
  - `permisos exactos`: `deepEqual(manifest.permissions.sort(), ['activeTab','offscreen','scripting','storage','unlimitedStorage'])`.
  - `sin permisos de host`: `manifest.host_permissions === undefined` y `manifest.optional_host_permissions === undefined`.
  - `version minima`: `manifest.minimum_chrome_version === '126'`, `manifest.manifest_version === 3`, `manifest.default_locale === 'es'`.
  - `atajos`: `commands['alternar-grabacion'].suggested_key.default === 'Alt+Shift+R'`, `commands['alternar-pausa'].suggested_key.default === 'Alt+Shift+P'`.
  - `textos existen`: toda cadena `__MSG_x__` en el manifiesto tiene clave `x` en `messages.json`.
  - `sin recursos accesibles`: `manifest.web_accessible_resources === undefined`.
- [ ] **Paso 2:** `npm test` → falla (no hay manifiesto).
- [ ] **Paso 3: crear los ficheros** con los valores de arriba; `messages.json` con `nombre` = «Grabador MP4» y `descripcion` = «Graba una pestaña, una ventana o la pantalla en MP4».
- [ ] **Paso 4:** `npm test` → pasa.
- [ ] **Paso 5: commit** `Andamiaje: manifiesto, textos y pruebas del manifiesto`.

---

### Tarea 2: Configuración y cálculos de calidad

**Ficheros:**
- Crear: `comun/config.js`, `comun/calidad.js`
- Prueba: `pruebas/calidad.test.js`

**Interfaces:**
- Produce (`comun/config.js`):
  - `CONFIG_DEFECTO = {fuente: 'browser', audio: true, calidad: 'normal', fps: 30}` (`fuente` ∈ `'browser'|'window'|'monitor'`).
  - `TIMESLICE_MS = 2000`, `CUENTA_S = 3`, `AVISO_MS = 3300000`, `MAX_MS = 3600000`, `VIGILANTE_MS = 5000`, `REINTENTO_ANCHO = 1920`.
- Produce (`comun/calidad.js`):
  - `FACTORES = {normal: 0.07, alta: 0.10, maxima: 0.15}`, `AUDIO_BPS = 128000`, `MAX_PIXELES = 9437184`
  - `bitrateVideo(ancho, alto, fps, nivel) → number` (entero)
  - `tamanoConTope(ancho, alto) → {ancho, alto, reducido}`
  - `tamanoReintento(ancho, alto) → {ancho, alto}`
  - `bytesPorMinuto(ancho, alto, fps, nivel, conAudio) → number`
  - `formatoTiempo(ms) → string` (`mm:ss`)
  - `formatoPeso(bytes) → string` (`«812 MB»`, `«1,4 GB»`, coma decimal)

- [ ] **Paso 1: escribir las pruebas**
  - `bitrateVideo(1920,1080,30,'normal') === 4354560`; `bitrateVideo(2560,1440,30,'normal') === 7741440`; nivel desconocido lanza `RangeError`.
  - `tamanoConTope(2560,1440)` → `{2560,1440,reducido:false}`; `(4096,2304)` → sin reducir; `(5120,2880)` → `{4096,2304,reducido:true}`; `(3440,1440)` sin reducir; para `(6016,3384)` el resultado es par, `ancho*alto <= MAX_PIXELES` y la proporción difiere < 1 %.
  - `tamanoReintento(5120,2880)` → `{1920,1080}`; `(1280,720)` → igual (no amplía); siempre pares.
  - `bytesPorMinuto(2560,1440,30,'normal',true)` ≈ `(7741440+128000)*60/8` (igualdad exacta con `Math.round`).
  - `formatoTiempo(0) === '00:00'`, `(61000) === '01:01'`, `(3600000) === '60:00'`, `(59999) === '00:59'`.
  - `formatoPeso(812e6) === '812 MB'`, `(1.4e9) === '1,4 GB'`.
- [ ] **Paso 2:** `npm test` → fallan.
- [ ] **Paso 3: implementar.** Tope: `s = Math.sqrt(MAX_PIXELES/(ancho*alto))`, redondear cada lado hacia abajo a par y, si el producto aún supera el tope, restar 2 al lado mayor hasta que quepa.
- [ ] **Paso 4:** `npm test` → pasan.
- [ ] **Paso 5: commit** `Cálculos de calidad, tope de resolución y formatos`.

---

### Tarea 3: Códec y nombre de archivo

**Ficheros:**
- Crear: `comun/codec.js`, `comun/nombre.js`
- Prueba: `pruebas/codec.test.js`, `pruebas/nombre.test.js`

**Interfaces:**
- Produce (`comun/codec.js`):
  - `elegirCodec({conAudio, esSoportado, plataforma, permitirOpus = false}) → {mime} | {error: 'linux' | 'sin_mp4'}`
    `esSoportado` es una función `(mime) => boolean` (en el navegador, `MediaRecorder.isTypeSupported`); `plataforma` es `chrome.runtime.getPlatformInfo().os`.
  - Orden con audio: `video/mp4;codecs="avc1.640034,mp4a.40.2"`, `…"avc1.4D0034,mp4a.40.2"`, `…"avc1.42E034,mp4a.40.2"`, `…"avc1,mp4a.40.2"`. Sin audio: los mismos sin `,mp4a.40.2`. Con `permitirOpus`, detrás de los AAC: los mismos con `,opus`.
  - Con `plataforma === 'linux'` y sin `permitirOpus` → `{error: 'linux'}` sin probar nada.
- Produce (`comun/nombre.js`):
  - `limpiarTitulo(texto) → string`
  - `nombreArchivo({superficie, tituloPestana, fecha}) → string` (`superficie` ∈ `'browser'|'window'|'monitor'`, `fecha` es `Date`, hora local)

- [ ] **Paso 1: escribir las pruebas de `codec`**
  - Todo soportado, con audio → el primero de la lista AAC.
  - Solo `avc1,mp4a.40.2` soportado → ese.
  - Sin audio y solo `video/mp4;codecs="avc1.42E034"` → ese.
  - Nada soportado, `win` → `{error:'sin_mp4'}`.
  - `linux` sin `permitirOpus` → `{error:'linux'}` y `esSoportado` no se llama (contador a 0).
  - `linux` con `permitirOpus`, solo Opus soportado → `video/mp4;codecs="avc1.640034,opus"`.
- [ ] **Paso 2: escribir las pruebas de `nombre`** (fecha `new Date(2026,10,1,14,32,5)`)
  - `browser` + «Panel de tráfico · NewFox» → `Panel-de-trafico-NewFox_2026-11-01_14-32.mp4`.
  - `window` → `Ventana_2026-11-01_14-32.mp4`; `monitor` → `Pantalla_2026-11-01_14-32.mp4`.
  - Título `'a:b/c\\d*e?f"g<h>i|j'` → sin ninguno de `\/:*?"<>|`.
  - Emoji «🎬 Demo 🎬» → `Demo_…`; título de 300 «x» → título de 80; `''`, `'   '`, `'???'` → `Grabacion_…`; «Nueva pestaña» → `Nueva-pestana_…`.
  - Nunca empieza ni acaba en `-` o `.`; nunca contiene `--`.
- [ ] **Paso 3:** `npm test` → fallan.
- [ ] **Paso 4: implementar.** `limpiarTitulo`: `normalize('NFD')` y quitar marcas diacríticas, dejar solo `[A-Za-z0-9 ._-]` (el resto → espacio), espacios → `-`, comprimir guiones, recortar `-` y `.` de los extremos, cortar a 80 y volver a recortar.
- [ ] **Paso 5:** `npm test` → pasan.
- [ ] **Paso 6: commit** `Elección de códec MP4 y nombre de archivo`.

---

### Tarea 4: Máquina de estados

**Ficheros:**
- Crear: `background/estado.js`
- Prueba: `pruebas/estado.test.js`

**Interfaces:**
- Produce:
  - `FASES = ['inactivo','eligiendo','cuenta_atras','grabando','en_pausa','cerrando']`
  - `transicion(fase, evento) → fase | null` (null = no permitida)
  - `accionAtajo(fase, comando) → evento | null` (`comando` ∈ `'alternar-grabacion'|'alternar-pausa'`)
  - `estadoInicial() → {fase:'inactivo', sesionId:null, config:null, inicioMs:null, ms:0, bytes:0, ancho:null, alto:null, original:null, conAudio:false, superficie:null, tituloPestana:'', pestanaId:null, avisos:[], error:null}`

  Tabla (todo lo no listado es `null`):

  | fase \ evento | iniciar | captura_lista | cuenta_fin | pausar | reanudar | detener | terminado | cancelar | error |
  |---|---|---|---|---|---|---|---|---|---|
  | inactivo | eligiendo | | | | | | | | |
  | eligiendo | | cuenta_atras | | | | | inactivo | inactivo | inactivo |
  | cuenta_atras | | | grabando | | | inactivo | inactivo | inactivo | inactivo |
  | grabando | | | | en_pausa | | cerrando | inactivo | | cerrando |
  | en_pausa | | | | | grabando | cerrando | inactivo | | cerrando |
  | cerrando | | | | | | | inactivo | | inactivo |

  `terminado` desde `grabando`/`en_pausa`/`cerrando` significa «hay vídeo y se abre la vista previa»; desde `eligiendo`/`cuenta_atras`, «no hay vídeo».

  `accionAtajo`: `alternar-grabacion` → `inactivo: 'iniciar'`, `eligiendo|cuenta_atras: 'cancelar'`, `grabando|en_pausa: 'detener'`, `cerrando: null`; `alternar-pausa` → `grabando: 'pausar'`, `en_pausa: 'reanudar'`, resto `null`.

- [ ] **Paso 1: escribir las pruebas:** cada celda no vacía de la tabla, una muestra de celdas vacías (`transicion('grabando','iniciar') === null`, **doble inicio**: `transicion('eligiendo','iniciar') === null`), cada caso de `accionAtajo`, y que `estadoInicial()` devuelve un objeto nuevo cada vez (mutar uno no afecta al siguiente).
- [ ] **Paso 2:** `npm test` → fallan.
- [ ] **Paso 3: implementar** con un objeto literal `{fase: {evento: nuevaFase}}` congelado.
- [ ] **Paso 4:** `npm test` → pasan.
- [ ] **Paso 5: commit** `Máquina de estados de la grabación`.

---

### Tarea 5: Almacén en IndexedDB

**Ficheros:**
- Crear: `comun/almacen.js`, `pruebas/integracion/util.cjs`, `pruebas/integracion/almacen.test.cjs`, `pruebas/integracion/pagina-almacen.html`

**Interfaces:**
- Produce (`comun/almacen.js`, base `grabador` versión 1; almacenes `sesiones` con `keyPath: 'id'` y `trozos` con `keyPath: ['sesion','n']`):
  - `crearSesion(datos) → Promise<void>`; `datos` = `{id, estado:'grabando', creada:number, superficie, tituloPestana, ancho, alto, original, conAudio, mime, avisos:[]}`
  - `actualizarSesion(id, cambios) → Promise<void>` (mezcla superficial)
  - `leerSesion(id) → Promise<objeto|undefined>`
  - `listarSesiones() → Promise<objeto[]>`
  - `anadirTrozo(sesion, n, blob) → Promise<void>`
  - `leerTrozos(sesion) → Promise<Blob[]>` (en orden de `n`, con `IDBKeyRange.bound([sesion,0],[sesion,Infinity])`)
  - `borrarSesion(id) → Promise<void>` (borra la sesión y todos sus trozos en una transacción)
  - `espacio() → Promise<{libre:number, cuota:number}>` (con `navigator.storage.estimate()`)
  - Estados de sesión: `'grabando' | 'terminada' | 'guardada'`.
- Produce (`pruebas/integracion/util.cjs`):
  - `servirRepo() → Promise<{url, cerrar}>`: servidor `http` estático de la raíz del repo en un puerto libre.
  - `lanzarExtension({args = []}) → Promise<{ctx, sw, extId, cerrar}>`: `launchPersistentContext('', {headless:false, viewport:null})` con `--disable-extensions-except`, `--load-extension`, `--force-device-scale-factor=2` y `args`; espera el service worker; pone `modoPrueba: true` en `chrome.storage.local`.
  - `ffprobe(ruta) → objeto` (JSON de `ffprobe -v error -show_streams -show_format -of json`).

- [ ] **Paso 1: escribir `almacen.test.cjs`**, que abre `pagina-almacen.html` servida por `servirRepo()` y evalúa en la página (importando `/comun/almacen.js`):
  - crear la sesión `s1` y añadir trozos `n` = 2, 0, 1 con contenido «c», «a», «b» → `leerTrozos('s1')` concatenado da «abc».
  - `actualizarSesion('s1', {estado:'terminada'})` → `leerSesion('s1').estado === 'terminada'` y conserva `superficie`.
  - dos sesiones; `borrarSesion('s1')` → `leerTrozos('s1')` vacío y los de `s2` intactos; `listarSesiones()` solo `s2`.
  - `espacio()` devuelve números > 0.
- [ ] **Paso 2:** `npm run test:integracion` → falla.
- [ ] **Paso 3: implementar** `almacen.js` (una conexión perezosa reutilizada; cada operación en su transacción con promesas sobre `oncomplete`/`onerror`), `util.cjs` y la página de prueba.
- [ ] **Paso 4:** `npm run test:integracion` → pasa.
- [ ] **Paso 5: commit** `Almacén de sesiones y trozos en IndexedDB, arnés de integración`.

---

### Tarea 6: Grabación de extremo a extremo (orquestador + grabadora)

**Ficheros:**
- Crear: `comun/mensajes.js`, `offscreen/grabadora.html`, `offscreen/grabadora.js`
- Modificar: `background/service-worker.js`
- Prueba: `pruebas/sw-sin-estado.test.js`, `pruebas/integracion/grabacion.test.cjs`

**Interfaces:**
- Consume: Tareas 2–5.
- Produce (`comun/mensajes.js`):
  - `enviar(tipo, datos = {}) → Promise<any>` (`chrome.runtime.sendMessage({tipo, ...datos})`; si no hay receptor, resuelve `undefined` sin lanzar).
  - Al service worker: `iniciar {config, tituloPestana, pestanaId}`, `pausar`, `reanudar`, `detener`, `cancelar`, `captura_lista {ancho, alto, original, conAudio, superficie, mime}`, `progreso {ms, bytes}`, `terminado {sesionId, hayVideo}`, `error {codigo, detalle}`, `aviso {codigo}`.
  - Al offscreen (todos con `destino: 'offscreen'`): `abrir {sesionId, config, permitirOpus}`, `grabar`, `pausar`, `reanudar`, `detener`, `cancelar`.
  - Códigos de error: `'cancelado'`, `'linux'`, `'sin_mp4'`, `'sin_espacio'`, `'grabadora'`, `'resolucion'`. Códigos de aviso: `'sin_audio'`, `'reducida'`, `'reintento'`, `'poco_espacio'`, `'quedan_5_min'`. Mensajes solo de prueba (la grabadora los ignora sin `modoPrueba`): `probar_fin` (para la pista de vídeo) y `probar_vigilante` (descarta los trozos de los primeros 6 s).
- Produce (`background/service-worker.js`):
  - `leerEstado() → Promise<estado>` y `guardarEstado(estado) → Promise<void>` sobre `chrome.storage.session` clave `estado` (con `setAccessLevel` por defecto: solo contextos de la extensión).
  - `aplicar(evento, cambios = {}) → Promise<estado|null>`: lee, usa `transicion()`; si es `null`, registra en consola y devuelve `null`; si no, guarda y ejecuta los efectos de la nueva fase.
  - Efectos por fase: `eligiendo` → crear el offscreen (`reasons: ['DISPLAY_MEDIA']`) y enviar `abrir`; `cuenta_atras` → insignia 3-2-1 con un `setTimeout` por segundo (el service worker sigue despierto: son 3 s), guardando `cuentaFinMs` en el estado; al llegar a 0, `aplicar('cuenta_fin')`; `grabando` → enviar `grabar`; `inactivo` → insignia vacía, `chrome.offscreen.closeDocument()` si existe; con `terminado` y `hayVideo`, abrir `vista/vista.html?sesion=<id>` en pestaña nueva.
  - Insignia (`actualizarInsignia(estado)`): `grabando` → texto `formatoTiempo`, fondo `#C8302B`; `en_pausa` → `II`, fondo `#8A5A00`; `cuenta_atras` → segundos restantes; resto → vacío.
  - `chrome.commands.onCommand` → `accionAtajo()` → `aplicar()`.
- Comportamiento de `offscreen/grabadora.js`:
  - `abrir`: `getDisplayMedia({video: {displaySurface: config.fuente, frameRate: config.fps}, audio: config.audio, systemAudio: 'include', windowAudio: 'system', selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude'})`; `NotAllowedError` → `error {codigo:'cancelado'}`. Lee `getSettings()`; aplica `tamanoConTope` con `applyConstraints({width, height})` si hace falta (aviso `reducida`); sin pista de audio pedida → aviso `sin_audio`; `elegirCodec` con `chrome.runtime.getPlatformInfo` (error `linux`/`sin_mp4` → liberar). Comprueba `espacio()` contra `bytesPorMinuto × 60` (aviso `poco_espacio`). `crearSesion`. Envía `captura_lista`.
  - `grabar`: `new MediaRecorder(stream, {mimeType, videoBitsPerSecond: bitrateVideo(...), audioBitsPerSecond: AUDIO_BPS})`, `start(TIMESLICE_MS)`; cada `dataavailable` → `anadirTrozo(sesion, n++, blob)`; si falla por cuota → `error sin_espacio` y detener. Envía `progreso` cada segundo con el tiempo sin contar las pausas; el service worker lo guarda en `estado.ms` y `estado.bytes` (lo único que leen popup y superposición para el tiempo). Vigilante: sin primer trozo en `VIGILANTE_MS` → parar el recorder, `applyConstraints(tamanoReintento(...))`, aviso `reintento`, reiniciar una vez; segunda vez → `error resolucion`. A `AVISO_MS` aviso `quedan_5_min`; a `MAX_MS` detener. Con `modoPrueba`, si `chrome.storage.local` trae `limitesPrueba: {avisoMs, maxMs}`, se usan esos valores.
  - `ended` de la pista de vídeo (Dejar de compartir, pestaña o ventana cerrada): si aún no graba → `terminado {hayVideo:false}` y `borrarSesion`; si graba → detener.
  - `detener`: `recorder.stop()`, esperar el último trozo escrito, `actualizarSesion(id, {estado:'terminada', duracionMs, bytes})`, `liberar()`, `terminado {hayVideo:true}`.
  - `cancelar`: `liberar()`, `borrarSesion`, `terminado {hayVideo:false}`.
  - `liberar()`: `track.stop()` de todas las pistas, anular referencias; idempotente.

- [ ] **Paso 1: escribir `pruebas/sw-sin-estado.test.js`:** lee `background/service-worker.js` y falla si hay alguna declaración `let` o `var` a nivel de módulo (línea que empieza sin sangría por `let ` o `var `).
- [ ] **Paso 2: escribir `grabacion.test.cjs`** (lanza con `--auto-select-desktop-capture-source=Entire screen`; desde el service worker evalúa `aplicar('iniciar', {config:{fuente:'monitor', audio:false, calidad:'normal', fps:30}, tituloPestana:'', pestanaId:null})`):
  - `graba pantalla`: espera la fase `grabando`, 5 s, `aplicar('detener')`; espera la pestaña de vista; lee los trozos (desde una página de la extensión), los escribe a un fichero temporal; `ffprobe` → vídeo `h264`, `width 1440`, `height 900`, `duration` entre 4 y 7; sin pista de audio.
  - `pestaña con audio`: con `--auto-select-tab-capture-source-by-title=Prueba`, una pestaña `<title>Prueba</title>` que reproduce un oscilador, `fuente:'browser', audio:true` → `ffprobe` con pista de audio `opus` (modo de prueba en Linux).
  - `doble inicio`: dos `aplicar('iniciar', …)` seguidos sin esperar → el segundo devuelve `null` y `chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})` tiene longitud 1.
  - `dejar de compartir en la cuenta atrás`: en `cuenta_atras`, detener la pista desde el offscreen (`stream.getVideoTracks()[0].stop()` vía un mensaje de prueba `probar_fin` que solo atiende si `modoPrueba`) → fase `inactivo`, sin offscreen y `listarSesiones()` vacío.
  - `estado sobrevive`: durante `grabando`, leer `chrome.storage.session` desde otra página de la extensión → `fase === 'grabando'` e `inicioMs` presente.
  - `linux sin modo de prueba`: con `modoPrueba: false` → `error` con `codigo 'linux'` en el estado y fase `inactivo`.
  - `pausa`: 2 s grabando, `pausar`, 3 s, `reanudar`, 2 s, `detener` → `ffprobe` da una duración entre 3 y 5 s, y `estado.ms` no avanzó durante la pausa.
  - `cancelar en la cuenta atrás`: `aplicar('cancelar')` en `cuenta_atras` → `inactivo`, sin offscreen, sin sesiones.
  - `límites`: `limitesPrueba: {avisoMs: 2000, maxMs: 4000}` → aparece el aviso `quedan_5_min` y la grabación se para sola y abre la vista.
  - `vigilante`: `probar_vigilante` antes de `grabar` → aviso `reintento` y el MP4 final pasa `ffprobe`.
- [ ] **Paso 3:** `npm test && npm run test:integracion` → fallan.
- [ ] **Paso 4: implementar** `mensajes.js`, la grabadora y el orquestador según las interfaces.
- [ ] **Paso 5:** `npm test && npm run test:integracion` → pasan.
- [ ] **Paso 6: commit** `Grabación de extremo a extremo: orquestador y grabadora offscreen`.

---

### Tarea 7: Superposición en la página

**Ficheros:**
- Crear: `superposicion/superposicion.js`
- Modificar: `background/service-worker.js` (inyección y avisos a la pestaña)
- Prueba: `pruebas/integracion/superposicion.test.cjs`

**Interfaces:**
- Consume: Tarea 6 (`aplicar`, mensajes).
- Produce:
  - El service worker inyecta con `chrome.scripting.executeScript({target:{tabId: estado.pestanaId}, files:['superposicion/superposicion.js']})` al entrar en `cuenta_atras`, envuelto en `try/catch` (páginas `chrome://`, tienda, pestaña cerrada → se ignora).
  - Al cambiar el estado, `chrome.tabs.sendMessage(pestanaId, {destino:'superposicion', estado})` con `.catch(() => {})`.
  - La superposición crea un host `<div id="grabador-mp4-superposicion">` con shadow root **cerrado**; muestra el número de la cuenta atrás (grande, centrado) y luego una pastilla arrastrable abajo a la derecha: punto rojo, `formatoTiempo` (copiado como función local, es script clásico), botones Pausa/Reanudar, Detener y Ocultar. Los botones envían `enviar('pausar'|'reanudar'|'detener')` vía `chrome.runtime.sendMessage`. Con fase `inactivo`, se retira sola. Inyectarla dos veces no duplica el host.

- [ ] **Paso 1: escribir las pruebas**
  - `cuenta y pastilla`: grabar con `pestanaId` de una página de prueba; durante `cuenta_atras` el host existe y su texto visible (vía `page.evaluate` sobre `document.getElementById(...)`, comprobando con una captura `page.screenshot` que hay píxeles rojos `#C8302B` en la esquina) — y en `grabando`, la pastilla.
  - `detener desde la pastilla`: clic en Detener (coordenadas de la pastilla con `page.mouse.click`) → fase `inactivo` y vista abierta.
  - `pestaña cerrada`: cerrar la pestaña de la superposición durante `grabando` → la fase sigue en `grabando` y la insignia avanza (leer `chrome.action.getBadgeText` dos veces con 2 s de diferencia: distintos).
  - `chrome://`: `pestanaId` de `chrome://version` → la grabación llega a `grabando` sin `error` en el estado.
  - `sin duplicar`: inyectar dos veces → un solo host.
- [ ] **Paso 2:** `npm run test:integracion` → fallan.
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4:** `npm run test:integracion` → pasan.
- [ ] **Paso 5: commit** `Superposición con cuenta atrás y controles`.

---

### Tarea 8: Identidad visual

**Ficheros:**
- Crear: `comun/estilo.css`, `fuentes/Outfit-Variable.woff2`, `fuentes/JetBrainsMono-Variable.woff2`, `fuentes/OFL-Outfit.txt`, `fuentes/OFL-JetBrainsMono.txt`, `iconos/reposo-{16,32,48,128}.png`, `iconos/grabando-{16,32,48,128}.png`, `iconos/iconos.svg` (fuente), `herramientas/iconos.cjs`
- Modificar: `manifest.json` (`icons`, `action.default_icon`)
- Prueba: `pruebas/identidad.test.js`

**Interfaces:**
- Produce (`comun/estilo.css`): `@font-face` para las dos letras (rutas relativas `../fuentes/…`); tokens en `:root`: `--azul #2E86AB`, `--azul-tinte #E6F2F7`, `--tinta #1C2634`, `--secundario #4A5866`, `--linea #DCE2E8`, `--fondo #FFFFFF`, `--hundido #FBFCFD`, `--rojo #C8302B`, `--rojo-tinte #FBEAE9`, `--ambar #8A5A00`, `--f-texto "Outfit", system-ui, sans-serif`, `--f-mono "JetBrains Mono", ui-monospace, monospace`; los mismos tokens redefinidos para `prefers-color-scheme: dark`; clases base `.btn`, `.btn-grabar`, `.campo`, `.aviso`, `.mono`.
- Icono: círculo de reposo con el azul y un punto central; «grabando» con punto rojo. `herramientas/iconos.cjs` renderiza el SVG con Playwright a los cuatro tamaños.
- El service worker cambia el icono con `chrome.action.setIcon` a `grabando-*` en `cuenta_atras`, `grabando`, `en_pausa`, y a `reposo-*` en el resto (añadir a `actualizarInsignia`).

- [ ] **Paso 1: escribir `pruebas/identidad.test.js`:** existen los 8 PNG y sus dimensiones (leídas de la cabecera PNG, bytes 16–23) coinciden con el nombre; `manifest.icons` apunta a los `reposo-*`; las dos `woff2` empiezan por `wOF2`; `estilo.css` define cada token en `:root` y en el bloque oscuro; hay licencias OFL.
- [ ] **Paso 2:** `npm test` → falla.
- [ ] **Paso 3:** descargar las dos letras variables de sus repositorios oficiales (Google Fonts en GitHub, `ofl/outfit` y `ofl/jetbrainsmono`) con sus licencias; escribir `estilo.css`, el SVG y el script de iconos; generar los PNG.
- [ ] **Paso 4:** `npm test` → pasa.
- [ ] **Paso 5: commit** `Identidad visual: letras, colores e iconos`.

---

### Tarea 9: Popup

**Ficheros:**
- Crear: `popup/popup.html`, `popup/popup.js`, `popup/popup.css`
- Modificar: `_locales/es/messages.json`
- Prueba: `pruebas/integracion/popup.test.cjs`

**Interfaces:**
- Consume: `CONFIG_DEFECTO`, `bytesPorMinuto`, `formatoTiempo`, `formatoPeso`, `enviar`, `estado` en `chrome.storage.session`.
- Produce:
  - **Parado** (fase `inactivo`): cuatro campos en lista (etiqueta a la izquierda, desplegable a la derecha, 300 px de ancho): Fuente (`Pestaña`/`Ventana`/`Pantalla`, valores `browser|window|monitor`, ayuda «La eliges en el selector de Chrome»), Audio (`Sin audio`/`Pestaña o sistema`), Calidad (`Normal`/`Alta`/`Máxima`), Fotogramas (`30`/`60`); botón **Grabar** (`.btn-grabar`); línea mono «≈ N MB por minuto a W×H» con `screen.width*devicePixelRatio`. La configuración se recuerda en `chrome.storage.local` clave `config`.
  - **Grabar**: `chrome.tabs.query({active:true, currentWindow:true})` → `enviar('iniciar', {config, tituloPestana: tab.title || '', pestanaId: tab.id})`, y `window.close()`.
  - **Grabando / en pausa**: tiempo grande (mono, `formatoTiempo(estado.ms)`), peso, resolución real (`ancho×alto`; si `original`, «reducida desde W×H»), avisos en lenguaje claro (uno por código), **Pausa/Reanudar** y **Detener**.
  - **Eligiendo / cuenta atrás**: texto «Elige qué grabar en el selector de Chrome» o el número; botón **Cancelar**.
  - **Error** (`estado.error` con fase `inactivo`): mensaje de `messages.json` por código, encima del formulario, y se limpia al volver a grabar.
  - Se repinta con `chrome.storage.onChanged` (área `session`).
  - Accesible con teclado: orden de tabulación natural, foco visible, `aria-live="polite"` en el tiempo.

- [ ] **Paso 1: escribir las pruebas** (abrir `chrome-extension://<id>/popup/popup.html` como página):
  - Estado inicial: valores por defecto seleccionados; la línea de peso contiene «MB por minuto».
  - Cambiar Calidad a «Alta», recargar → sigue «Alta».
  - Escribir en `chrome.storage.session` un estado `grabando` con `ms: 61000`, `bytes: 812e6` → aparecen «01:01», «812 MB», botones Pausa y Detener.
  - Con `error: {codigo:'linux'}` → se ve «Esta extensión funciona en Windows y macOS».
  - Clic en Grabar (con `modoPrueba` y auto-selección de pantalla) → la fase pasa a `eligiendo` o posterior.
- [ ] **Paso 2:** `npm run test:integracion` → fallan.
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4:** `npm run test:integracion` → pasan.
- [ ] **Paso 5: commit** `Popup en lista compacta`.

---

### Tarea 10: Vista previa, guardado y recuperación

**Ficheros:**
- Crear: `vista/vista.html`, `vista/vista.js`, `vista/vista.css`
- Modificar: `background/service-worker.js` (`recuperarHuerfanas()` en `chrome.runtime.onStartup` y `onInstalled`), `_locales/es/messages.json`
- Prueba: `pruebas/integracion/vista.test.cjs`

**Interfaces:**
- Consume: `leerSesion`, `leerTrozos`, `actualizarSesion`, `borrarSesion`, `nombreArchivo`, `formatoTiempo`, `formatoPeso`.
- Produce:
  - `vista.html?sesion=<id>[&recuperada=1]`: `<video controls>` con `URL.createObjectURL(new Blob(trozos, {type: sesion.mime}))` (revocado en `pagehide`); ficha con resolución real (`videoWidth×videoHeight`), duración, peso, nombre propuesto; avisos (reducida, sin audio, recuperada).
  - **Guardar**: `showSaveFilePicker({suggestedName: nombreArchivo(...), types:[{description:'Vídeo MP4', accept:{'video/mp4':['.mp4']}}]})`; escribe los trozos uno a uno con `createWritable()`; al cerrar, `actualizarSesion(id,{estado:'guardada'})`, `borrarSesion(id)` y mensaje «Guardado como N». `AbortError` → no hace nada y conserva todo.
  - **Descartar**: confirmación dentro de la página (bloque con «Descartar para siempre» y «Volver»); confirmado → `borrarSesion(id)` y mensaje final.
  - Sesión inexistente → «Esta grabación ya no existe».
  - `recuperarHuerfanas()`: para cada sesión con `estado === 'grabando'` cuando la fase es `inactivo`, `actualizarSesion(id,{estado:'terminada'})` y abrir `vista.html?sesion=<id>&recuperada=1`. Las sesiones `terminada` sin pestaña de vista abierta también se abren.

- [ ] **Paso 1: escribir las pruebas**
  - Tras una grabación de 5 s de pantalla: la vista muestra «1440×900» y una duración que empieza por «00:0».
  - **Guardar** con `showSaveFilePicker` sustituido en la página (`addInitScript`) por uno que recoge los bytes escritos → los bytes concatenados pasan `ffprobe` (h264, 1440×900) y la sesión ya no existe.
  - Guardar con el sustituto lanzando `AbortError` → la sesión sigue y no hay mensaje de error.
  - **Descartar** → confirmar → la sesión no existe; «Volver» no borra.
  - `?sesion=noexiste` → «Esta grabación ya no existe».
  - **Recuperación:** durante `grabando`, cerrar el offscreen a la fuerza desde el service worker (`chrome.offscreen.closeDocument()`) y poner la fase en `inactivo` sin pasar por `detener`; llamar `recuperarHuerfanas()` → se abre `vista.html?…&recuperada=1`, enseña el aviso de recuperada y el vídeo pasa `ffprobe` tras guardarlo.
- [ ] **Paso 2:** `npm run test:integracion` → fallan.
- [ ] **Paso 3: implementar.**
- [ ] **Paso 4:** `npm run test:integracion` → pasan.
- [ ] **Paso 5: commit** `Vista previa, Guardar como, descartar y recuperación`.

---

### Tarea 11: Documentación de uso y checklist de la Fase 3

**Ficheros:**
- Crear: `README.md`, `docs/fase3-checklist.md`
- Prueba: ejecución completa

- [ ] **Paso 1: `README.md`**: qué hace; instalación paso a paso en `chrome://extensions` (modo desarrollador → Cargar descomprimida → carpeta del repo); uso; atajos y dónde cambiarlos; macOS: permiso «Grabación de pantalla y audio del sistema» para Chrome en Ajustes del Sistema; limitaciones conocidas (Linux no; título de la pestaña activa; superposición visible en el vídeo; barra de Chrome no se oculta; tope 4096×2304 hasta confirmar la Fase 3); cómo ejecutar las pruebas.
- [ ] **Paso 2: `docs/fase3-checklist.md`**: tabla fuente (pestaña, ventana, pantalla) × audio (sin audio, pestaña/sistema) × sistema (Windows, macOS), con columnas: se graba, resolución con `ffprobe` = física, audio presente, abre en QuickTime, abre en VLC, abre en el reproductor de Windows; más los 7 puntos de §8 de la especificación con su forma de comprobarlo; el comando `ffprobe` de la especificación §7; cómo conocer la resolución física (Windows: Configuración → Pantalla; macOS: Información del sistema → Gráficos/Pantallas).
- [ ] **Paso 3:** `npm test && npm run test:integracion` → todo pasa.
- [ ] **Paso 4: commit** `Instrucciones de instalación, limitaciones y checklist de la Fase 3`.
