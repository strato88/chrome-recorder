# Pruebas de la Fase 1

Sondas usadas para el diagnóstico (`docs/fase1-diagnostico.md`). No forman parte de la extensión.

- `mediarecorder_mp4.js`: tipos MP4 aceptados y grabación de un lienzo a varios tamaños. `node mediarecorder_mp4.js`
- `extension-sonda/`: extensión mínima (service worker + offscreen).
- `escenario_*.js`: cada uno prueba una forma de capturar. Necesitan pantalla:
  `xvfb-run -a -s "-screen 0 1440x900x24" node escenario_offscreen_display_media.js "$PWD/extension-sonda"`
  (`escenario_sw_selector.js` y `escenario_pagina_a_offscreen.js` reciben además el nombre de la fuente, p. ej. `"Entire screen"`).

Requieren Playwright y el Chromium que trae instalado.
