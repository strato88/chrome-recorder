# Fase 1: diagnóstico técnico

**Fecha:** 1 de noviembre de 2026
**Entorno de pruebas:** Google Chrome for Testing 153.0.8010.12 en Linux x86_64, con pantalla virtual (Xvfb, 1440×900 físicos, escala ×2), dirigido con Playwright. Los scripts están en `pruebas/fase1/` y se pueden repetir.
**Alcance:** lo que se puede comprobar sin un Mac ni un Windows. Lo que depende del sistema queda para la Fase 3 y está marcado como tal.

## Resumen

| # | Pregunta de la especificación (§8) | Resultado | Cómo |
|---|---|---|---|
| 1 | Motivo del documento offscreen | `USER_MEDIA` para `tabCapture`; **`DISPLAY_MEDIA` para ventana y pantalla, llamando a `getDisplayMedia()` desde el propio offscreen** | Muestra oficial + prueba |
| 1b | ¿Sirve `desktopCapture` desde el service worker? | **No.** Error textual: «A target tab is required when called from a service worker context.» | Prueba |
| 2 | MP4 nativo: soporte y estructura | MP4 H.264 sí. **AAC no en Linux** (sí en Windows y macOS). Sale **fragmentado** (`ftyp`, `moov` con `mvex`, pares `moof`/`mdat`) | Prueba + MDN |
| 3 | ¿H.264 por encima de 4096×2304? | 4096×2304 graba (nivel 5.1). **5120×2880 se cuelga** con el codificador por software | Prueba |
| 4 | Resolución nativa | **Sin restricciones de tamaño** Chrome da los píxeles físicos (1440×900 con escala ×2). **Con `maxWidth/maxHeight` altos, escala hacia arriba** (8192×8192) | Prueba |
| 5 | Audio del sistema en macOS y Linux | Sin cambios respecto a la Fase 0. No comprobable aquí | Fase 3 |
| 6 | `showSaveFilePicker` en páginas de la extensión | Existe (`typeof` = `function`) | Prueba |
| 7 | Avisos al instalar | `tabCapture`: «Read and change all your data on all websites». `desktopCapture`: «Capture content of your screen». `downloads`: «Manage your downloads». El resto, ninguno | Documentación oficial |
| 8 | Redimensionar la ventana grabada | No comprobable aquí | Fase 3 |
| 9 | MP4 sin el último trozo (recuperación) | **Válido**: ffprobe lo lee y ffmpeg lo descodifica entero | Prueba |

## Detalle

### 1. Dónde se abre el selector de ventana o pantalla

La especificación preveía pedir el id con `chrome.desktopCapture.chooseDesktopMedia` desde el service worker y pasarlo al offscreen. Las pruebas lo descartan:

- **Desde el service worker sin pestaña:** error inmediato, «A target tab is required when called from a service worker context.» (`escenario_sw_selector.js`).
- **Con pestaña de destino:** según la referencia, el id solo vale para esa pestaña y su origen, no para el offscreen.
- **Desde una página de la extensión, pasando el id al offscreen:** el id llega, pero `getUserMedia` en el offscreen falla con «AbortError: Error starting tab capture». En la misma página que abrió el selector sí funciona (`escenario_pagina_a_offscreen.js`, `escenario_resolucion_nativa.js`).
- **`getDisplayMedia()` dentro del offscreen creado con el motivo `DISPLAY_MEDIA`, a petición del service worker:** funciona y devuelve la pantalla a 1440×900 (`escenario_offscreen_display_media.js`). Es lo que sugiere la guía oficial: «For background recording across navigations, use an offscreen document with the `DISPLAY_MEDIA` reason.»

**Consecuencia:** ventana y pantalla se graban con `getDisplayMedia()` en el offscreen. **Sobra el permiso `desktopCapture`** y con él su aviso al instalar.
**Reserva:** la prueba usa `--auto-select-desktop-capture-source`, que elige sola en el selector. Con el selector real y un usuario hay que confirmar en la Fase 3 que no se exige una «activación por el usuario» que el offscreen no puede tener. Si se exigiera, la alternativa probada es grabar en una pequeña página visible de la extensión.

### 2. MP4: códecs y estructura

`MediaRecorder.isTypeSupported` en Chrome 153 Linux:

| Tipo | ¿Soportado? |
|---|---|
| `video/mp4`, `video/mp4;codecs=avc1` | Sí |
| `video/mp4;codecs="avc1.*,mp4a.40.2"` (todas las variantes) | **No** |
| `audio/mp4;codecs=mp4a.40.2` | **No** |
| `video/mp4;codecs="avc1.*,opus"` (Baseline, Main, High, cualquier nivel) | Sí |
| `video/mp4;codecs="hvc1…"`, `av01…` con AAC | No |

- **AAC:** Chrome no trae codificador AAC propio; usa el del sistema. MDN indica que no hay codificación AAC en Linux de escritorio en ningún navegador ([MDN, selección de códec en WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)); el fallo de Chromium [40127044](https://issues.chromium.org/issues/40127044) lo limitaba a Windows y Mac. **En Windows y macOS se espera AAC; hay que confirmarlo con `isTypeSupported` en la Fase 3.**
- **Fragmentado:** confirmado. Todas las grabaciones tienen `ftyp`, un `moov` con `mvex` y luego pares `moof`/`mdat`, con duración legible por ffprobe. Ejemplo 1920×1080: H.264 High, nivel 4.2.
- **Marcas de tiempo:** al descodificar con ffmpeg aparecen avisos «non monotonically increasing dts» (fotogramas repetidos de una fuente de ritmo variable). VLC y ffmpeg lo reproducen, pero es lo primero que hay que mirar si QuickTime da problemas. El plan B de la especificación (reordenar el MP4 al guardar) lo corregiría.

### 3. Tope de resolución

| Tamaño | Resultado |
|---|---|
| 1920×1080 | Graba, H.264 High nivel 4.2 |
| 2560×1440 | Graba, nivel 5.1 |
| 4096×2304 | Graba, nivel 5.1 |
| 5120×2880 | **No termina** (más de 10 minutos para 4 s de vídeo; detenido a mano) |

La prueba usa el codificador por software de Linux; en Windows y macOS Chrome usa el del sistema, que puede comportarse distinto. **El tope de la especificación (≈ 9,4 M píxeles, 4096×2304) se mantiene.** Además, se pondrá un vigilante: si en 5 segundos no llega el primer trozo, se para y se reintenta a menor tamaño.

### 4. Cómo obtener la resolución nativa

- Sin restricciones de tamaño (`getDisplayMedia({video: true})` o `getUserMedia` solo con el id), `getSettings()` devuelve **los píxeles físicos**: 1440×900 en una pantalla de 720×450 CSS a escala ×2.
- Con `maxWidth/maxHeight` de 8192, Chrome **escala la imagen hasta 8192×8192**. Por tanto **no se piden tamaños**: se lee `getSettings()` y, solo si supera el tope, se reduce con `applyConstraints`.

### 6. Guardar

`showSaveFilePicker` existe en las páginas de la extensión. No se ha podido abrir el diálogo en la prueba automática (es nativo); se confirma en la Fase 3. **No hace falta el permiso `downloads`.**

### 7. Avisos de permisos

Según la [lista oficial de permisos](https://developer.chrome.com/docs/extensions/reference/permissions-list):

| Permiso | Aviso |
|---|---|
| `tabCapture` | «Read and change all your data on all websites» («Leer y cambiar todos tus datos de todos los sitios web») |
| `desktopCapture` | «Capture content of your screen» (ya no hace falta, §1) |
| `downloads` | «Manage your downloads» (no hace falta, §6) |
| `offscreen`, `activeTab`, `scripting`, `storage`, `unlimitedStorage` | Ninguno |

`unlimitedStorage` «Provides an unlimited quota for chrome.storage.local, IndexedDB, Cache Storage, and Origin Private File System».

### 9. Recuperación

Cada `ondataavailable` con `timeslice` entrega fragmentos completos. Un archivo formado por todos los trozos menos el último lo leen ffprobe (con duración) y ffmpeg (lo descodifica entero). Recuperar tras un cierre de Chrome es viable tal como dice la especificación.

## Cambios que esto pide en la especificación

1. **Ventana y pantalla:** `getDisplayMedia()` en el offscreen (motivo `DISPLAY_MEDIA`). Se quita `desktopCapture`. El selector se orienta con `displaySurface: 'window' | 'monitor'`; el audio, con `systemAudio`/`windowAudio`.
2. **Resolución:** no pedir tamaño; leer `getSettings()`; reducir solo por encima del tope; vigilante de 5 s.
3. **Pestaña:** decisión pendiente (ver abajo).
4. **Audio en Linux:** decisión pendiente (ver abajo).
5. **Guardado:** `showSaveFilePicker` confirmado; sin `downloads`.

## Decisiones que necesito del propietario

**A. Grabar una pestaña.** Para grabarla sin selector hace falta `tabCapture`, y Chrome avisa al instalar de que la extensión puede «leer y cambiar todos tus datos de todos los sitios web» (aunque no lo haga). La alternativa es grabar la pestaña con el mismo selector de Chrome que ventana y pantalla (un clic más, pestaña preseleccionada): ningún permiso con aviso y una sola forma de capturar en el código.

**B. Audio en Linux.** En Linux Chrome no sabe codificar AAC. Opciones: grabar el MP4 con audio Opus (lo reproducen VLC y los navegadores; QuickTime probablemente no), grabar sin audio en Linux, o no dar soporte a Linux.

## Fuentes

- [Chrome for Developers: Audio recording and screen capture](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [chrome.offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.desktopCapture](https://developer.chrome.com/docs/extensions/reference/api/desktopCapture)
- [Lista de permisos y avisos](https://developer.chrome.com/docs/extensions/reference/permissions-list)
- [Muestra oficial tabcapture-recorder](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.tabcapture-recorder)
- [MDN: getDisplayMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [MDN: selección de códec (AAC en Linux)](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)
- [Chromium 40127044: AAC en MediaRecorder](https://issues.chromium.org/issues/40127044)
- [Notas de Chrome 126](https://developer.chrome.com/release-notes/126) y [141](https://developer.chrome.com/release-notes/141)
