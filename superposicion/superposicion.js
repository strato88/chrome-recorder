// Superposición en la página: número de la cuenta atrás y pastilla con el tiempo,
// Pausa/Reanudar, Detener y Ocultar. Script CLÁSICO inyectado con
// chrome.scripting.executeScript: no puede importar módulos. Vive en el mundo
// aislado, así que la página no ve nada de esto; el host usa shadow root cerrado
// y letras del sistema (sin recursos accesibles desde la web).
(() => {
  'use strict';

  const CLAVE = '__grabadorMp4Superposicion';
  if (globalThis[CLAVE]) return; // inyectada dos veces: sigue valiendo la primera
  globalThis[CLAVE] = true;

  const ID_HOST = 'grabador-mp4-superposicion';
  const MARGEN = 16;

  // Copia de formatoTiempo de comun/calidad.js (aquí no se pueden importar módulos).
  function formatoTiempo(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  const TEXTOS = {
    superCuentaAtras: 'Cuenta atrás de la grabación',
    superControles: 'Controles de la grabación',
    superPausar: 'Pausar grabación',
    superReanudar: 'Reanudar grabación',
    superDetener: 'Detener grabación',
    superOcultar: 'Ocultar controles',
  };
  const texto = (clave) => {
    try { return chrome.i18n.getMessage(clave) || TEXTOS[clave]; } catch { return TEXTOS[clave]; }
  };

  const ESTILO = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .capa {
      position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
      font: 600 14px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #fff;
    }
    .cuenta {
      position: absolute; left: 50%; top: 50%; width: 140px; height: 140px;
      margin: -70px 0 0 -70px; border-radius: 50%;
      background: rgba(28, 38, 52, .88); border: 6px solid #C8302B;
      display: flex; align-items: center; justify-content: center;
      font-size: 72px; font-weight: 700; font-variant-numeric: tabular-nums;
    }
    .pastilla {
      position: absolute; right: ${MARGEN}px; bottom: ${MARGEN}px; pointer-events: auto;
      display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px;
      border-radius: 999px; background: rgba(28, 38, 52, .94);
      box-shadow: 0 4px 16px rgba(0, 0, 0, .35); cursor: grab; touch-action: none; user-select: none;
    }
    .pastilla.arrastrando { cursor: grabbing; }
    .punto { width: 10px; height: 10px; border-radius: 50%; background: #C8302B; flex: none; }
    .grabando .punto { animation: latido 1.6s ease-out infinite; }
    .pausa .punto { background: #D9A441; }
    @keyframes latido {
      0% { box-shadow: 0 0 0 0 rgba(200, 48, 43, .7); }
      70%, 100% { box-shadow: 0 0 0 7px rgba(200, 48, 43, 0); }
    }
    .tiempo { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 14px;
      font-variant-numeric: tabular-nums; min-width: 5ch; text-align: center; }
    button {
      all: unset; box-sizing: border-box; width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff;
    }
    button:hover { background: rgba(255, 255, 255, .16); }
    button:focus-visible { outline: 2px solid #8CC7E0; outline-offset: 1px; }
    button:disabled { opacity: .4; cursor: default; background: none; }
    [hidden] { display: none !important; }
    svg { width: 16px; height: 16px; fill: currentColor; pointer-events: none; }
    @media (prefers-reduced-motion: reduce) { .grabando .punto { animation: none; } }
  `;

  const ICONOS = {
    pausa: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>',
    reanudar: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.2v11.6a.8.8 0 0 0 1.2.7l9-5.8a.8.8 0 0 0 0-1.4l-9-5.8A.8.8 0 0 0 4 2.2z"/></svg>',
    detener: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>',
    ocultar: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.3 3.3a1 1 0 0 1 1.4 0L8 6.6l3.3-3.3a1 1 0 1 1 1.4 1.4L9.4 8l3.3 3.3a1 1 0 0 1-1.4 1.4L8 9.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L6.6 8 3.3 4.7a1 1 0 0 1 0-1.4z"/></svg>',
  };

  // Lo que se pinta: una sola vez creado, después solo se actualiza.
  let vista = null; // {host, numero, pastilla, punto, tiempo, bPausa, bDetener, bOcultar}
  let ocultaEn = null; // sesión cuya pastilla se ocultó: sigue oculta el resto de esa grabación
  let ultimaSesion = null; // sesión del último aviso recibido

  function enviar(tipo) {
    try {
      const respuesta = chrome.runtime.sendMessage({ tipo });
      if (respuesta && typeof respuesta.catch === 'function') respuesta.catch(() => {});
    } catch { /* la extensión se recargó o se cerró: nada que hacer */ }
  }

  function boton(icono, etiqueta, alPulsar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icono;
    b.title = etiqueta;
    b.setAttribute('aria-label', etiqueta);
    b.addEventListener('click', alPulsar);
    return b;
  }

  function crear() {
    const host = document.createElement('div');
    host.id = ID_HOST;
    const raiz = host.attachShadow({ mode: 'closed' });
    const estilo = document.createElement('style');
    estilo.textContent = ESTILO;
    const capa = document.createElement('div');
    capa.className = 'capa';

    const numero = document.createElement('div');
    numero.className = 'cuenta';
    numero.dataset.parte = 'cuenta';
    numero.setAttribute('role', 'timer');
    numero.setAttribute('aria-label', texto('superCuentaAtras'));

    const pastilla = document.createElement('div');
    pastilla.className = 'pastilla';
    pastilla.dataset.parte = 'pastilla';
    pastilla.setAttribute('role', 'group');
    pastilla.setAttribute('aria-label', texto('superControles'));
    const punto = document.createElement('span');
    punto.className = 'punto';
    punto.dataset.parte = 'punto';
    const tiempo = document.createElement('span');
    tiempo.className = 'tiempo';
    tiempo.dataset.parte = 'tiempo';
    const bPausa = boton(ICONOS.pausa, texto('superPausar'), () => enviar(bPausa.dataset.accion));
    bPausa.dataset.accion = 'pausar';
    const bDetener = boton(ICONOS.detener, texto('superDetener'), () => enviar('detener'));
    const bOcultar = boton(ICONOS.ocultar, texto('superOcultar'), () => {
      ocultaEn = ultimaSesion;
      retirar();
    });
    pastilla.append(punto, tiempo, bPausa, bDetener, bOcultar);
    hacerArrastrable(pastilla);

    capa.append(numero, pastilla);
    raiz.append(estilo, capa);
    (document.body || document.documentElement).append(host);
    return { host, numero, pastilla, punto, tiempo, bPausa, bDetener, bOcultar };
  }

  // Arrastre con el puntero desde cualquier parte de la pastilla que no sea un botón.
  function hacerArrastrable(pastilla) {
    let origen = null;
    pastilla.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest?.('button')) return;
      const r = pastilla.getBoundingClientRect();
      origen = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      pastilla.setPointerCapture(e.pointerId);
      pastilla.classList.add('arrastrando');
      e.preventDefault();
    });
    pastilla.addEventListener('pointermove', (e) => {
      if (!origen) return;
      const ancho = document.documentElement.clientWidth;
      const alto = document.documentElement.clientHeight;
      const r = pastilla.getBoundingClientRect();
      const x = Math.min(Math.max(0, e.clientX - origen.dx), Math.max(0, ancho - r.width));
      const y = Math.min(Math.max(0, e.clientY - origen.dy), Math.max(0, alto - r.height));
      Object.assign(pastilla.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
    });
    const soltar = () => { origen = null; pastilla.classList.remove('arrastrando'); };
    pastilla.addEventListener('pointerup', soltar);
    pastilla.addEventListener('pointercancel', soltar);
  }

  function retirar() {
    vista?.host.remove();
    vista = null;
  }

  function mostrar(estado) {
    ultimaSesion = estado.sesionId;
    const fase = estado?.fase;
    const cuenta = fase === 'cuenta_atras';
    const pastilla = fase === 'grabando' || fase === 'en_pausa' || fase === 'cerrando';
    if (!cuenta && !pastilla) { retirar(); return; }
    if (pastilla && ocultaEn !== null && ocultaEn === estado.sesionId) { retirar(); return; }
    if (!vista || !vista.host.isConnected) vista = crear();

    vista.numero.hidden = !cuenta;
    vista.pastilla.hidden = !pastilla;
    if (cuenta) {
      const s = Math.ceil(((estado.cuentaFinMs ?? Date.now()) - Date.now()) / 1000);
      vista.numero.textContent = String(Math.max(1, s));
    }
    if (pastilla) {
      const enPausa = fase === 'en_pausa';
      vista.pastilla.classList.toggle('pausa', enPausa);
      vista.pastilla.classList.toggle('grabando', fase === 'grabando');
      vista.tiempo.textContent = formatoTiempo(estado.ms);
      const etiqueta = texto(enPausa ? 'superReanudar' : 'superPausar');
      vista.bPausa.dataset.accion = enPausa ? 'reanudar' : 'pausar';
      vista.bPausa.innerHTML = enPausa ? ICONOS.reanudar : ICONOS.pausa;
      vista.bPausa.title = etiqueta;
      vista.bPausa.setAttribute('aria-label', etiqueta);
      vista.bPausa.disabled = fase === 'cerrando';
      vista.bDetener.disabled = fase === 'cerrando';
    }
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.destino === 'superposicion' && m.estado) mostrar(m.estado);
    return false;
  });
})();
